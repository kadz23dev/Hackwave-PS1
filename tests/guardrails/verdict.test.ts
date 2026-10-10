import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Guardrail G5 — No AI verdict (verdict.test.ts)', () => {
  it('[R-F4-05] verdict.ts has no import from src/llm', () => {
    const verdictFile = resolve('src/classify/verdict.ts');
    const content = readFileSync(verdictFile, 'utf8');

    // Extract all import lines
    const importLines = content
      .split('\n')
      .filter(line => line.trim().startsWith('import'))
      .join('\n');

    expect(/llm/i.test(importLines)).toBe(false);
  });
});
