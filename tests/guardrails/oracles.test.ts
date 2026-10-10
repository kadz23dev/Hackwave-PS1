import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { allRequiredPass, runOracles } from '../../src/oracle/runner.js';
import type { Intent } from '../../src/types.js';

describe('Guardrail G4/G5 — Deterministic oracle runner guardrails', () => {
  it('[R-F4-05] src/oracle has no import from src/llm', () => {
    const runnerFile = resolve('src/oracle/runner.ts');
    const content = readFileSync(runnerFile, 'utf8');
    const importLines = content
      .split('\n')
      .filter(line => line.trim().startsWith('import'))
      .join('\n');
    expect(/llm/i.test(importLines)).toBe(false);
  });

  it('allRequiredPass returns false when there are zero required oracles', () => {
    expect(allRequiredPass([])).toBe(false);
    expect(
      allRequiredPass([
        { oracleId: 'dom', type: 'dom_state', ok: true, supportingOnly: true, detail: {} },
      ])
    ).toBe(false);
  });

  it('[R-F4-04] oracle that throws (server stopped / unreachable) is ok:false, never pass', async () => {
    const intent: Intent = {
      name: 'test',
      site: 'test',
      goal: 'Test unreachable server',
      startPath: '/',
      actionBudget: 10,
      allowedOrigins: ['http://127.0.0.1:9999'],
      data: {},
      planner: { doneWhen: { pathPattern: '/done' } },
      expected: [
        {
          id: 'unreachable-backend',
          type: 'backend_state',
          request: { method: 'GET', path: '/__state' },
          select: 'orders',
          where: {},
          expect: { count: 1, fields: { status: 'PAID' } },
        },
      ],
    };
    const results = await runOracles(intent, 'http://127.0.0.1:9999', [], {} as unknown as Page);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toHaveProperty('error');
    expect(allRequiredPass(results)).toBe(false);
  });
});
