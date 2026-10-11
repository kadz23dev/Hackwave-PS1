import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tempDb } from '../helpers/db.js';

describe('KaizenAI MCP Server — Stdio Integration Tests', { timeout: 30000 }, () => {
  beforeAll(() => {
    // Ensure dist/mcp/server.js is built
    execSync('npm run build', { stdio: 'pipe' });
  });

  it('connects over StdioClientTransport and invokes list_monitored_sites via CLI --db arg', async () => {
    const { repo, path: testDbPath } = tempDb();
    repo.upsertSite('integration-shop', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101']);

    const serverScript = resolve('dist/mcp/server.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverScript, '--db', testDbPath],
      stderr: 'pipe',
    });

    let stderrLogs = '';
    if (transport.stderr) {
      transport.stderr.on('data', (chunk: Buffer) => {
        stderrLogs += chunk.toString();
      });
    }

    const client = new Client(
      { name: 'integration-test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);

    // 1. Verify Handshake
    const serverVersion = client.getServerVersion();
    expect(serverVersion?.name).toBe('kaizenai');
    expect(serverVersion?.version).toBe('1.0.0');

    // 2. Verify List Tools
    const toolsResult = await client.listTools();
    expect(toolsResult.tools.some((t) => t.name === 'list_monitored_sites')).toBe(true);

    // 3. Call list_monitored_sites
    const result = await client.callTool({
      name: 'list_monitored_sites',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      sites: Array<{ id: number; name: string; baseUrl: string; allowlist: string[] }>;
    };
    expect(structured.sites).toHaveLength(1);
    expect(structured.sites[0].name).toBe('integration-shop');
    expect(structured.sites[0].baseUrl).toBe('http://127.0.0.1:4101');
    expect(structured.sites[0].allowlist).toEqual(['http://127.0.0.1:4101']);

    // 4. Verify stderr received diagnostics while stdout remained clean JSON-RPC
    expect(stderrLogs).toContain('[kaizenai-mcp]');

    await client.close();
  });

  it('connects and honors HEALTEST_DB_PATH environment variable', async () => {
    const { repo, path: testDbPath } = tempDb();
    repo.upsertSite('env-configured-site', 'https://example.org', ['https://example.org']);

    const serverScript = resolve('dist/mcp/server.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverScript],
      env: {
        ...process.env,
        HEALTEST_DB_PATH: testDbPath,
      },
      stderr: 'pipe',
    });

    const client = new Client(
      { name: 'env-test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);

    const result = await client.callTool({
      name: 'list_monitored_sites',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      sites: Array<{ id: number; name: string; baseUrl: string }>;
    };
    expect(structured.sites).toHaveLength(1);
    expect(structured.sites[0].name).toBe('env-configured-site');
    expect(structured.sites[0].baseUrl).toBe('https://example.org');

    await client.close();
  });
});
