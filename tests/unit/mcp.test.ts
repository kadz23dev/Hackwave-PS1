import { describe, it, expect, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { tempDb } from '../helpers/db.js';
import {
  createMcpServer,
  sanitizeUrl,
  sanitizeSite,
  resolveDbPath,
} from '../../src/mcp/server.js';
import type Database from 'better-sqlite3';

describe('KaizenAI MCP Server — Unit Tests', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof tempDb>['repo'];

  beforeEach(() => {
    const fixture = tempDb();
    db = fixture.db;
    repo = fixture.repo;
  });

  async function createConnectedClient(serverOptions: Parameters<typeof createMcpServer>[0] = {}) {
    const server = createMcpServer({ repo, ...serverOptions });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    return { client, server };
  }

  it('1. performs MCP initialization handshake and reports server info', async () => {
    const { client } = await createConnectedClient();
    const serverVersion = client.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(serverVersion?.name).toBe('kaizenai');
    expect(serverVersion?.version).toBe('1.0.0');
    await client.close();
  });

  it('2. advertises list_monitored_sites tool with schema and description', async () => {
    const { client } = await createConnectedClient();
    const toolsResult = await client.listTools();

    expect(toolsResult.tools).toHaveLength(1);
    const tool = toolsResult.tools[0];
    expect(tool.name).toBe('list_monitored_sites');
    expect(tool.description).toContain('monitored');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.type).toBe('object');
    await client.close();
  });

  it('3. returns actual site records from database with structured content and text', async () => {
    repo.upsertSite('gizmo', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101', 'http://127.0.0.1:4102']);
    repo.upsertSite('portal', 'http://127.0.0.1:4105', ['http://127.0.0.1:4105']);

    const { client } = await createConnectedClient();
    const result = await client.callTool({
      name: 'list_monitored_sites',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();

    const structured = result.structuredContent as { sites: Array<{ id: number; name: string; baseUrl: string; allowlist: string[] }> };
    expect(structured.sites).toHaveLength(2);
    expect(structured.sites[0].name).toBe('gizmo');
    expect(structured.sites[0].baseUrl).toBe('http://127.0.0.1:4101');
    expect(structured.sites[0].allowlist).toEqual(['http://127.0.0.1:4101', 'http://127.0.0.1:4102']);

    expect(structured.sites[1].name).toBe('portal');
    expect(structured.sites[1].baseUrl).toBe('http://127.0.0.1:4105');

    // Human-readable text
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');
    const text = content[0].text;
    expect(text).toContain('Monitored Sites (2 registered):');
    expect(text).toContain('gizmo');
    expect(text).toContain('portal');

    await client.close();
  });

  it('4. returns a valid empty list when no sites are registered', async () => {
    const { client } = await createConnectedClient();
    const result = await client.callTool({
      name: 'list_monitored_sites',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { sites: unknown[] };
    expect(structured.sites).toEqual([]);

    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content[0]?.text;
    expect(text).toBe('No monitored sites are registered in KaizenAI.');
    await client.close();
  });

  it('5. returns safe error on database failure and does not throw', async () => {
    // Create server with a non-existent database path to simulate missing db
    const server = createMcpServer({ dbPath: 'C:\\nonexistent-dir-12345\\missing.sqlite' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      name: 'list_monitored_sites',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0].type).toBe('text');
    const text = content[0].text;
    expect(text).toContain('Database error');
    expect(text).toContain('missing.sqlite');

    const structured = result.structuredContent as { error: string; sites: unknown[] };
    expect(structured.sites).toEqual([]);
    expect(structured.error).toBeDefined();

    await client.close();
  });

  it('6. strips sensitive credentials and masks secrets from URLs and allowlists', () => {
    const rawUrl = 'https://admin:superSecretPass123@api.example.com/checkout?token=secretToken456&safe=1';
    const sanitized = sanitizeUrl(rawUrl);

    expect(sanitized).not.toContain('superSecretPass123');
    expect(sanitized).not.toContain('admin:');
    expect(sanitized).toContain('token=%5BREDACTED%5D');
    expect(sanitized).toContain('safe=1');

    const site = sanitizeSite({
      id: 99,
      name: 'secure-site',
      base_url: rawUrl,
      baseUrl: rawUrl,
      allowlist_json: '[]',
      allowlist: [
        'https://user:pass@internal.origin.com:8443',
        'http://safe.origin.com',
      ],
    });

    expect(site.baseUrl).not.toContain('superSecretPass123');
    expect(site.allowlist[0]).not.toContain('pass');
    expect(site.allowlist[0]).toContain('internal.origin.com:8443');
    expect(site.allowlist[1]).toBe('http://safe.origin.com');
  });

  it('7. validates inputs and filters by siteId and name', async () => {
    repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    repo.upsertSite('other', 'http://127.0.0.1:4102', []);

    const { client } = await createConnectedClient();

    // Filter by siteId
    const resId = await client.callTool({
      name: 'list_monitored_sites',
      arguments: { siteId: 1 },
    });
    const structId = resId.structuredContent as { sites: Array<{ id: number; name: string }> };
    expect(structId.sites).toHaveLength(1);
    expect(structId.sites[0].name).toBe('gizmo');

    // Filter by name
    const resName = await client.callTool({
      name: 'list_monitored_sites',
      arguments: { name: 'other' },
    });
    const structName = resName.structuredContent as { sites: Array<{ id: number; name: string }> };
    expect(structName.sites).toHaveLength(1);
    expect(structName.sites[0].name).toBe('other');

    // Unknown arguments trigger input validation error
    const resInvalid = await client.callTool({
      name: 'list_monitored_sites',
      arguments: { unexpectedField: 'bad' },
    });
    expect(resInvalid.isError).toBe(true);

    await client.close();
  });

  it('8. writes audit log entry upon listing sites following repository conventions', () => {
    repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const sites = repo.listSites('mcp-test-actor');
    expect(sites).toHaveLength(1);

    const auditRows = db.prepare('SELECT * FROM audit_log WHERE action = ?').all('site.list') as Array<{
      actor: string;
      action: string;
      entity: string;
    }>;
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[0].actor).toBe('mcp-test-actor');
    expect(auditRows[0].action).toBe('site.list');
    expect(auditRows[0].entity).toBe('sites');
  });

  it('9. resolves database path honoring HEALTEST_DB_PATH and explicit paths', () => {
    const explicit = 'D:\\custom\\test.sqlite';
    expect(resolveDbPath(explicit)).toBe(explicit);

    const oldEnv = process.env.HEALTEST_DB_PATH;
    try {
      process.env.HEALTEST_DB_PATH = 'E:\\env-path\\healtest.sqlite';
      expect(resolveDbPath()).toBe('E:\\env-path\\healtest.sqlite');
    } finally {
      if (oldEnv !== undefined) {
        process.env.HEALTEST_DB_PATH = oldEnv;
      } else {
        delete process.env.HEALTEST_DB_PATH;
      }
    }
  });
});
