import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

export interface RouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  params: string[];
  query: URLSearchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | string;
  pattern: RegExp;
  handler: (ctx: RouteContext) => Promise<void>;
}

export function json(res: http.ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, x-csrf-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

export function fail(res: http.ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { error: { code, message } });
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function parseBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<{ ok: boolean; body?: unknown }> {
  return new Promise((resolvePromise) => {
    let bodyBytes = 0;
    const chunks: Buffer[] = [];
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      bodyBytes += chunk.length;
      if (bodyBytes > 1024 * 1024) {
        aborted = true;
        fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds 1 MB limit');
        resolvePromise({ ok: false });
      } else {
        chunks.push(chunk);
      }
    });

    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (raw.length === 0) {
        resolvePromise({ ok: true, body: {} });
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolvePromise({ ok: true, body: parsed });
      } catch {
        fail(res, 400, 'BAD_REQUEST', 'Invalid JSON payload');
        resolvePromise({ ok: false });
      }
    });

    req.on('error', (err) => {
      if (aborted) return;
      fail(res, 400, 'BAD_REQUEST', err.message);
      resolvePromise({ ok: false });
    });
  });
}

export function createServer(routes: Route[], staticDir: string): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '127.0.0.1';
      const parsedUrl = new URL(req.url ?? '/', `http://${host}`);
      const pathname = parsedUrl.pathname;
      const query = parsedUrl.searchParams;

      // Handle OPTIONS preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, x-csrf-token',
        });
        res.end();
        return;
      }

      // 1. Check registered API routes
      for (const route of routes) {
        if (route.method === req.method) {
          const match = pathname.match(route.pattern);
          if (match) {
            let body: unknown = {};
            if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
              const bodyResult = await parseBody(req, res);
              if (!bodyResult.ok) {
                return;
              }
              body = bodyResult.body;
            }

            const params = match.slice(1);
            await route.handler({ req, res, params, query, body });
            return;
          }
        }
      }

      // 2. Static file serving (only for GET)
      if (req.method !== 'GET') {
        fail(res, 404, 'NOT_FOUND', 'Route not found');
        return;
      }

      const rootDir = process.cwd();
      const dashboardDir = resolve(rootDir, 'dashboard');
      let resolvedFile: string | null = null;

      if (pathname === '/' || pathname === '/index.html') {
        // Landing Page
        const candidate = resolve(rootDir, 'index.html');
        resolvedFile = existsSync(candidate) ? candidate : resolve(dashboardDir, 'index.html');
      } else if (pathname === '/signup.html' || pathname === '/signup' || pathname === '/login') {
        // Sign In / Sign Up Page
        const candidate = resolve(rootDir, 'signup.html');
        resolvedFile = existsSync(candidate) ? candidate : resolve(dashboardDir, 'index.html');
      } else if (
        pathname === '/dashboard' ||
        pathname === '/dashboard/' ||
        pathname === '/dashboard/index.html' ||
        pathname === '/app' ||
        pathname === '/app/'
      ) {
        // Real Dashboard Application
        resolvedFile = resolve(dashboardDir, 'index.html');
      } else if (pathname.startsWith('/dashboard/')) {
        const sub = pathname.slice('/dashboard/'.length);
        const candidate = resolve(dashboardDir, sub);
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          resolvedFile = candidate;
        }
      } else {
        // General asset lookup: check root first, then dashboard directory
        const candRoot = resolve(rootDir, '.' + pathname);
        const candDash = resolve(dashboardDir, '.' + pathname);
        if (existsSync(candRoot) && statSync(candRoot).isFile()) {
          resolvedFile = candRoot;
        } else if (existsSync(candDash) && statSync(candDash).isFile()) {
          resolvedFile = candDash;
        }
      }

      if (!resolvedFile || !existsSync(resolvedFile) || !statSync(resolvedFile).isFile()) {
        fail(res, 404, 'NOT_FOUND', 'File not found');
        return;
      }

      const ext = extname(resolvedFile).toLowerCase();
      const contentType = MIME_MAP[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      createReadStream(resolvedFile).pipe(res);
    } catch (err) {
      fail(res, 500, 'INTERNAL_ERROR', err instanceof Error ? err.message : String(err));
    }
  });
}
