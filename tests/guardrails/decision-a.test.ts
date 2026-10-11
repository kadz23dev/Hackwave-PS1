import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

describe('Decision-A guardrail — no writes outside HEALTEST_HOME', () => {
  it('[R-F2-05] HealTest has no write path outside HEALTEST_HOME (no writes to target app source)', () => {
    const srcDir = resolve('src');
    const writeRegex = /\b(writeFileSync|writeFile|appendFileSync|appendFile|rmSync|unlinkSync|cpSync|mkdirSync)\b/;
    const allowlist = ['src/db/index.ts', 'src/llm/replay.ts', 'src/snapshot/capture.ts'];

    function getAllTsFiles(dir: string): string[] {
      const files: string[] = [];
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = resolve(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...getAllTsFiles(fullPath));
        } else if (entry.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const tsFiles = getAllTsFiles(srcDir);
    const matchingFiles: string[] = [];

    for (const file of tsFiles) {
      const content = readFileSync(file, 'utf8');
      if (writeRegex.test(content)) {
        const rel = relative(resolve('.'), file).replace(/\\/g, '/');
        matchingFiles.push(rel);
      }
    }

    for (const match of matchingFiles) {
      expect(allowlist).toContain(match);
    }

    expect(matchingFiles.sort()).toEqual(allowlist.sort());
  });
});
