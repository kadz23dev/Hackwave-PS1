import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const token: string = randomBytes(24).toString('hex');
export const csrfToken: string = token;

export function check(req: IncomingMessage, expectedToken = token): boolean {
  const header = req.headers['x-csrf-token'];
  if (!header || typeof header !== 'string') {
    return false;
  }
  const headerBuf = Buffer.from(header, 'utf8');
  const tokenBuf = Buffer.from(expectedToken, 'utf8');
  if (headerBuf.length !== tokenBuf.length) {
    return false;
  }
  return timingSafeEqual(headerBuf, tokenBuf);
}

export function checkCsrf(req: IncomingMessage, expectedToken = token): boolean {
  return check(req, expectedToken);
}

export function getToken(): string {
  return token;
}
