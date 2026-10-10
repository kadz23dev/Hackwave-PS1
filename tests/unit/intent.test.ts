import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadIntent } from '../../src/intent/load.js';

// Helper: write a temp YAML file and return its path
function writeTmp(name: string, content: string): string {
  const p = join(tmpdir(), name);
  writeFileSync(p, content, 'utf8');
  return p;
}

const validYaml = `
name: test-intent
site: test-site
goal: Buy something.
startPath: /
allowedOrigins:
  - http://127.0.0.1:4101
actionBudget: 20
data:
  product: Gizmo Mini
  email: alice@example.com
planner:
  doneWhen:
    pathPattern: "^/confirmation"
expected:
  - id: order-created
    type: backend_state
    request:
      method: GET
      path: /__state
    select: orders
    where:
      email: "{{data.email}}"
    expect:
      count: 1
      fields:
        status: PAID
  - id: no-errors
    type: network_status
    urlPattern: "^/api/"
    forbidStatusAtLeast: 500
  - id: confirmation-shown
    type: dom_state
    textAny:
      - order confirmed
    supportingOnly: true
`;

describe('intent loader', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

  it('[R-PS-01] loads an intent as goal + data + expected outcomes, with no selectors', () => {
    const p = writeTmp('valid.intent.yaml', validYaml);
    tmpFiles.push(p);

    const { intent, sha256 } = loadIntent(p);

    expect(intent.goal).toBe('Buy something.');
    expect(intent.data.email).toBe('alice@example.com');
    expect(intent.expected).toHaveLength(3);
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);

    // No selectors anywhere in the intent
    const json = JSON.stringify(intent);
    expect(json).not.toMatch(/selector|#[a-z-]+-button/i);
  });

  it('rejects unknown keys', () => {
    const badYaml = validYaml + '\nextraKey: not-allowed\n';
    const p = writeTmp('unknown-key.intent.yaml', badYaml);
    tmpFiles.push(p);

    expect(() => loadIntent(p)).toThrow();
  });

  it('rejects template referencing missing data key', () => {
    const badYaml = validYaml.replace(
      'email: "{{data.email}}"',
      'email: "{{data.nonExistentKey}}"',
    );
    const p = writeTmp('bad-template.intent.yaml', badYaml);
    tmpFiles.push(p);

    expect(() => loadIntent(p)).toThrow(/unknown template key data\.nonExistentKey/);
  });
});
