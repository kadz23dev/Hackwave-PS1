import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadIntent } from '../../src/intent/load.js';

function writeTmp(name: string, content: string): string {
  const p = join(tmpdir(), name);
  writeFileSync(p, content, 'utf8');
  return p;
}

const validYaml = `
name: guardrail-intent
site: guardrail-site
goal: Test freeze guardrail.
startPath: /
allowedOrigins:
  - http://127.0.0.1:4101
actionBudget: 10
data:
  product: Gizmo Mini
  email: test@example.com
planner:
  doneWhen:
    pathPattern: "^/done"
expected:
  - id: check-status
    type: network_status
    urlPattern: "^/api/"
    forbidStatusAtLeast: 500
`;

describe('guardrails: intent immutability', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

  it('[R-F4-01] mutating a loaded intent throws and sha256 is stable', () => {
    const p = writeTmp('guardrail.intent.yaml', validYaml);
    tmpFiles.push(p);

    const { intent: intent1, sha256: sha1 } = loadIntent(p);
    const { sha256: sha2 } = loadIntent(p);

    // sha256 must be stable across two loads of the same file
    expect(sha1).toBe(sha2);
    expect(sha1).toMatch(/^[a-f0-9]{64}$/);

    // Mutating a top-level property must throw (Object.freeze)
    expect(() => {
      (intent1 as Record<string, unknown>).goal = 'x';
    }).toThrow(TypeError);

    // Mutating a nested object must also throw
    expect(() => {
      (intent1.data as Record<string, unknown>).email = 'hacker@bad.com';
    }).toThrow(TypeError);

    // Mutating an array element must also throw
    expect(() => {
      (intent1.allowedOrigins as string[])[0] = 'http://evil.com';
    }).toThrow(TypeError);
  });
});
