import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const srcDir = resolve('src/db/migrations');
const distDir = resolve('dist/db/migrations');

if (existsSync(srcDir)) {
  mkdirSync(distDir, { recursive: true });
  cpSync(srcDir, distDir, { recursive: true });
}
