import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runActs, type ActResult } from '../../src/demo.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

describe('Demo Integration — T20', { timeout: 120000 }, () => {
  let tmpHome: string;
  let results: ActResult[];

  beforeAll(async () => {
    tmpHome = mkdtempSync(join(tmpdir(), 'healtest-demo-test-'));
    results = await runActs([1, 2, 3], {
      homeDir: tmpHome,
      interactive: false,
      headless: true,
    });
  }, 120000);

  afterAll(() => {
    if (tmpHome) {
      try {
        rmSync(tmpHome, { recursive: true, force: true });
      } catch {}
    }
  });

  it('[R-PS-08] demo uses v2 as an intentional UI change of v1 (the v1 plan fails replay on v2)', () => {
    expect(results).toHaveLength(3);
    // Act 1: baseline passes on shop-v1
    expect(results[0].act).toBe(1);
    expect(results[0].verdict).toBe('PASS');
    expect(results[0].exitCode).toBe(0);

    // Act 2: v1 plan encounters intentional redesign on v2, repairs and validates
    expect(results[1].act).toBe(2);
    expect(results[1].verdict).toBe('HEALED_PASS');
    expect(results[1].exitCode).toBe(0);

    // Act 3: reuse validated repair with zero LLM calls
    expect(results[2].act).toBe(3);
    expect(results[2].verdict).toBe('HEALED_PASS');
    expect(results[2].exitCode).toBe(0);
  });

  it('demo acts 1–3 produce PASS, HEALED_PASS, HEALED_PASS with llmCalls 0', () => {
    expect(results.map((r) => r.verdict)).toEqual(['PASS', 'HEALED_PASS', 'HEALED_PASS']);
    expect(results.every((r) => r.llmCalls === 0)).toBe(true);
    expect(results[0].llmCalls).toBe(0);
    expect(results[1].llmCalls).toBe(0);
    expect(results[2].llmCalls).toBe(0);
  });
});
