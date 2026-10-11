import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { runIntent } from '../../src/pipeline/run.js';

describe('Run v2 scenarios — T12', { timeout: 90000 }, () => {
  let fV1: { url: string; stop(): Promise<void> } | undefined;
  let fV2: { url: string; stop(): Promise<void> } | undefined;
  let fV2Bug: { url: string; stop(): Promise<void> } | undefined;

  beforeAll(async () => {
    fV1 = await startFixture('shop-v1', '4101');
    fV2 = await startFixture('shop-v2', '4102');
    fV2Bug = await startFixture('shop-v2-bug', '4103');
  });

  afterAll(async () => {
    if (fV1) await fV1.stop();
    if (fV2) await fV2.stop();
    if (fV2Bug) await fV2Bug.stop();
  });

  it('[R-SC-A] [R-PS-09] v1 then v2 → HEALED_PASS exit 0, repair validated, backend has 1 order', async () => {
    const { db, path: dbPath } = tempDb();

    // 1. Baseline run on v1
    const baseline = await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
    });
    expect(baseline.verdict).toBe('PASS');
    expect(baseline.exitCode).toBe(0);

    // 2. Replay run on v2
    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });

    expect(v2Outcome.verdict).toBe('HEALED_PASS');
    expect(v2Outcome.exitCode).toBe(0);
    expect(v2Outcome.repairId).not.toBeNull();

    // 3. Verify repair status is 'validated'
    const repairRow = db.prepare('SELECT * FROM repairs WHERE id = ?').get(v2Outcome.repairId) as {
      id: number;
      status: string;
    };
    expect(repairRow).toBeDefined();
    expect(repairRow.status).toBe('validated');

    // 4. Verify /__state shows exactly 1 order after validation
    const res = await fetch(`${fV2!.url}/__state`);
    const state = (await res.json()) as { orders: unknown[] };
    expect(state.orders).toHaveLength(1);
  });

  it('[R-SC-B] fresh DB: v1 then v2-bug → APP_BUG exit 10, repair rejected', async () => {
    const { db, path: dbPath } = tempDb();

    // 1. Baseline run on v1
    const baseline = await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
    });
    expect(baseline.verdict).toBe('PASS');
    expect(baseline.exitCode).toBe(0);

    // 2. Replay run on v2-bug
    const v2BugOutcome = await runIntent('intents/checkout.intent.yaml', fV2Bug!.url, {
      db: dbPath,
      headless: true,
    });

    expect(v2BugOutcome.verdict).toBe('APP_BUG');
    expect(v2BugOutcome.exitCode).toBe(10);
    expect(v2BugOutcome.repairId).not.toBeNull();

    // 3. Verify repair status is 'rejected'
    const repairRow = db.prepare('SELECT * FROM repairs WHERE id = ?').get(v2BugOutcome.repairId) as {
      id: number;
      status: string;
    };
    expect(repairRow).toBeDefined();
    expect(repairRow.status).toBe('rejected');

    // 4. Verify /__state shows 0 orders
    const res = await fetch(`${fV2Bug!.url}/__state`);
    const state = (await res.json()) as { orders: unknown[] };
    expect(state.orders).toHaveLength(0);
  });
});
