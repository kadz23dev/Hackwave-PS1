import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db/index.js';
import { Repo, type StoredSite } from '../db/repo.js';
import { HOME } from '../config.js';

/**
 * Zod schema for input validation on list_monitored_sites.
 * Allows optional filtering by site ID or site name. Strict mode rejects unknown fields.
 */
export const ListMonitoredSitesInputSchema = z
  .object({
    siteId: z.number().int().positive().optional().describe('Optional specific site ID to filter by'),
    name: z.string().min(1).optional().describe('Optional site name to filter by'),
  })
  .strict();

export type ListMonitoredSitesInput = z.infer<typeof ListMonitoredSitesInputSchema>;

/**
 * Sanitized site schema exposing only public/safe fields.
 * Strips any embedded credentials or sensitive secrets.
 */
export const SanitizedSiteSchema = z.object({
  id: z.number().describe('Unique site identifier'),
  name: z.string().describe('Human-readable site name'),
  baseUrl: z.string().describe('Sanitized base URL of the monitored site'),
  allowlist: z.array(z.string()).describe('List of allowed origins/URLs for the site'),
});

export type SanitizedSite = z.infer<typeof SanitizedSiteSchema>;

/**
 * Output schema for list_monitored_sites structured content.
 */
export const ListMonitoredSitesOutputSchema = z.object({
  sites: z.array(SanitizedSiteSchema).describe('Array of monitored sites'),
  error: z.string().optional().describe('Error message if a partial failure occurred'),
});

export type ListMonitoredSitesOutput = z.infer<typeof ListMonitoredSitesOutputSchema>;

/**
 * Sanitize a URL to remove embedded credentials (user:password)
 * and mask known secret/token query parameters.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';
    const sensitiveParams = ['token', 'secret', 'key', 'auth', 'password', 'apikey', 'api_key'];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '[REDACTED]');
      }
    }
    let result = parsed.toString();
    // Preserve absence of trailing slash if original URL didn't have one
    if (!rawUrl.endsWith('/') && parsed.pathname === '/' && !parsed.search && !parsed.hash) {
      result = result.replace(/\/$/, '');
    }
    return result;
  } catch {
    return rawUrl;
  }
}

/**
 * Convert a stored database site record into a sanitized, safe representation.
 */
export function sanitizeSite(site: StoredSite): SanitizedSite {
  let allowlist: string[] = [];
  if (Array.isArray(site.allowlist)) {
    allowlist = site.allowlist.map((item) => (typeof item === 'string' ? sanitizeUrl(item) : String(item)));
  } else if (typeof site.allowlist === 'string') {
    allowlist = [sanitizeUrl(site.allowlist)];
  }

  return {
    id: site.id,
    name: site.name,
    baseUrl: sanitizeUrl(site.baseUrl || site.base_url),
    allowlist,
  };
}

/**
 * Format a list of sanitized sites into human-readable text for agents.
 */
export function formatSitesAsText(sites: SanitizedSite[]): string {
  if (sites.length === 0) {
    return 'No monitored sites are registered in KaizenAI.';
  }

  const lines: string[] = [`Monitored Sites (${sites.length} registered):`, ''];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const allowlistStr = s.allowlist.length > 0 ? s.allowlist.join(', ') : '(none configured)';
    lines.push(`${i + 1}. [ID ${s.id}] ${s.name}`);
    lines.push(`   Base URL: ${s.baseUrl}`);
    lines.push(`   Allowlist: ${allowlistStr}`);
    if (i < sites.length - 1) {
      lines.push('');
    }
  }
  return lines.join('\n');
}

/**
 * Resolve the database path explicitly.
 * Order of precedence:
 * 1. explicitPath parameter (e.g. from CLI --db)
 * 2. HEALTEST_DB_PATH environment variable
 * 3. HEALTEST_HOME environment variable (if set)
 * 4. Custom config HOME (if changed from default)
 * 5. Project root's .healtest/healtest.sqlite (relative to this module, so working directory doesn't divert it)
 */
export function resolveDbPath(explicitPath?: string): string {
  const isWindowsAbsolutePath = (candidate: string): boolean =>
    /^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith('\\\\');

  if (explicitPath) {
    if (isWindowsAbsolutePath(explicitPath)) {
      return explicitPath;
    }
    return resolve(explicitPath);
  }
  if (process.env.HEALTEST_DB_PATH) {
    if (isWindowsAbsolutePath(process.env.HEALTEST_DB_PATH)) {
      return process.env.HEALTEST_DB_PATH;
    }
    return resolve(process.env.HEALTEST_DB_PATH);
  }
  if (process.env.HEALTEST_HOME) {
    return resolve(process.env.HEALTEST_HOME, 'healtest.sqlite');
  }
  if (HOME !== '.healtest') {
    return resolve(HOME, 'healtest.sqlite');
  }
  // Anchor to the repository root relative to import.meta.url
  const projectRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  return join(projectRoot, '.healtest', 'healtest.sqlite');
}

export interface McpServerOptions {
  db?: Database.Database;
  repo?: Repo;
  dbPath?: string;
  actor?: string;
}

/**
 * Factory function creating an initialized McpServer with KaizenAI tools registered.
 */
export function createMcpServer(options: McpServerOptions = {}): McpServer {
  const actor = options.actor ?? 'mcp';
  const server = new McpServer({
    name: 'kaizenai',
    version: '1.0.0',
  });

  // Safe resolver for the repository layer
  function getRepo(): Repo {
    if (options.repo) {
      return options.repo;
    }
    if (options.db) {
      return new Repo(options.db);
    }
    const resolvedPath = resolveDbPath(options.dbPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(
        `Database file not found at "${resolvedPath}". Ensure HealTest has initialized the database or configure HEALTEST_DB_PATH.`
      );
    }
    const db = openDb(resolvedPath);
    return new Repo(db);
  }

  // Register read-only tool: list_monitored_sites
  server.registerTool(
    'list_monitored_sites',
    {
      title: 'List Monitored Sites',
      description:
        'Discover websites currently monitored and registered in KaizenAI with their identifiers, names, base URLs, and configured allowlists.',
      inputSchema: ListMonitoredSitesInputSchema,
      outputSchema: ListMonitoredSitesOutputSchema,
    },
    async (args?: ListMonitoredSitesInput) => {
      try {
        const repo = getRepo();
        let storedSites = repo.listSites(actor);

        if (args?.siteId !== undefined) {
          storedSites = storedSites.filter((s) => s.id === args.siteId);
        }
        if (args?.name !== undefined) {
          storedSites = storedSites.filter((s) => s.name === args.name);
        }

        const sanitized = storedSites.map(sanitizeSite);
        const textRepresentation = formatSitesAsText(sanitized);

        return {
          content: [
            {
              type: 'text' as const,
              text: textRepresentation,
            },
          ],
          structuredContent: {
            sites: sanitized,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[kaizenai-mcp] list_monitored_sites error: ${message}\n`);
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Database error while listing monitored sites: ${message}`,
            },
          ],
          structuredContent: {
            error: message,
            sites: [],
          },
        };
      }
    }
  );

  return server;
}

/**
 * Start the MCP server using StdioServerTransport.
 * Diagnostic logs are sent strictly to stderr to keep stdout clear for MCP JSON-RPC.
 */
export async function startServer(options: McpServerOptions = {}): Promise<McpServer> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();

  process.stderr.write('[kaizenai-mcp] Starting KaizenAI MCP Server on stdio...\n');
  await server.connect(transport);
  process.stderr.write('[kaizenai-mcp] KaizenAI MCP Server connected and listening.\n');

  return server;
}

function parseCliDb(): string | undefined {
  const args = process.argv.slice(2);
  const dbIdx = args.indexOf('--db');
  if (dbIdx !== -1 && dbIdx + 1 < args.length) {
    return args[dbIdx + 1];
  }
  return undefined;
}

const isDirectRun =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === resolve(process.argv[1]) ||
    process.argv[1].endsWith('server.js') ||
    process.argv[1].endsWith('server.ts'));

if (isDirectRun) {
  const cliDb = parseCliDb();
  startServer({ dbPath: cliDb }).catch((err) => {
    process.stderr.write(`[kaizenai-mcp] Fatal error: ${err instanceof Error ? err.stack || err.message : String(err)}\n`);
    process.exit(1);
  });
}
