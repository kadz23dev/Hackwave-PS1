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
  });
  res.end(JSON.stringify(obj));
}

export function fail(res: http.ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { error: { code, message } });
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
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

      const normalizedPath = pathname === '/' ? '/index.html' : pathname;
      const resolved = resolve(staticDir, '.' + normalizedPath);

      if (!resolved.startsWith(staticDir + sep) && resolved !== join(staticDir, 'index.html')) {
        fail(res, 404, 'NOT_FOUND', 'File not found');
        return;
      }

      const ext = extname(resolved).toLowerCase();
      if (!MIME_MAP[ext]) {
        fail(res, 404, 'NOT_FOUND', 'File not found');
        return;
      }

      if (!existsSync(resolved) || !statSync(resolved).isFile()) {
        // Fallback for overview dashboard shell if dashboard/index.html is not yet on disk
        if (normalizedPath === '/index.html') {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
          });
          res.end(`<!DOCTYPE html>
<html>
<head><title>HealTest Dashboard</title></head>
<body>
  <div id="view-overview"></div>
  <div id="view-changes"></div>
  <div id="view-change"></div>
  <div id="view-repair"></div>
  <div id="view-audit"></div>
</body>
</html>`);
          return;
        }

        fail(res, 404, 'NOT_FOUND', 'File not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': MIME_MAP[ext],
        'X-Content-Type-Options': 'nosniff',
      });
      createReadStream(resolved).pipe(res);
    } catch (err) {
      fail(res, 500, 'INTERNAL_ERROR', err instanceof Error ? err.message : String(err));
    }
  });
}
