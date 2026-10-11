import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { Repo } from '../../src/db/repo.js';
import { runIntent } from '../../src/pipeline/run.js';
import { runValidation } from '../../src/validate/validation.js';

describe('Validation loop integration — T12', { timeout: 90000 }, () => {
  let fV1: { url: string; stop(): Promise<void> } | undefined;
  let fV2: { url: string; stop(): Promise<void> } | undefined;

  beforeAll(async () => {
    fV1 = await startFixture('shop-v1', '4101');
    fV2 = await startFixture('shop-v2', '4102');
  });

  afterAll(async () => {
    if (fV1) await fV1.stop();
    if (fV2) await fV2.stop();
  });

  it('[R-F2-04] validation reruns the repaired plan in a fresh context against the original intent oracles', async () => {
    const { db, path: dbPath } = tempDb();
    const repo = new Repo(db);

    // 1. Run baseline on v1
    const baseline = await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
    });
    expect(baseline.verdict).toBe('PASS');

    // 2. Run replay on v2 (triggers repair & validation)
    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });
    expect(v2Outcome.verdict).toBe('HEALED_PASS');
    expect(v2Outcome.repairId).not.toBeNull();

    // 3. Directly invoke runValidation on the repair
    const valOutcome = await runValidation(repo, v2Outcome.repairId!, {
      target: fV2!.url,
      headless: true,
    });

    expect(valOutcome.verdict).toBe('HEALED_PASS');
    expect(valOutcome.runId).toBeGreaterThan(0);
    expect(valOutcome.runId).not.toBe(v2Outcome.runId);
    expect(valOutcome.oracleResults.length).toBeGreaterThan(0);
    expect(valOutcome.oracleResults.every(r => r.ok)).toBe(true);
  });

  it('[R-F3-04] repair stored with proposal_json steps and step_plan_id', async () => {
    const { db, path: dbPath } = tempDb();

    await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
    });

    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });

    expect(v2Outcome.repairId).not.toBeNull();

    const repairRow = db.prepare('SELECT * FROM repairs WHERE id = ?').get(v2Outcome.repairId) as {
      id: number;
      step_plan_id: number;
      proposal_json: string;
      status: string;
    };
    expect(repairRow).toBeDefined();
    expect(repairRow.step_plan_id).toBeGreaterThan(0);

    const proposal = JSON.parse(repairRow.proposal_json);
    expect(Array.isArray(proposal.steps)).toBe(true);
    expect(proposal.steps.length).toBeGreaterThan(0);

    const stepPlanRow = db.prepare('SELECT * FROM step_plans WHERE id = ?').get(repairRow.step_plan_id) as {
      id: number;
      origin: string;
      steps_json: string;
    };
    expect(stepPlanRow).toBeDefined();
    expect(stepPlanRow.origin).toBe('repair');
  });

  it('[R-F3-06] validation run stores verdict and per-oracle results', async () => {
    const { db, path: dbPath } = tempDb();

    await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
    });

    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });

    expect(v2Outcome.validationRunId).not.toBeNull();

    const valRunRow = db.prepare('SELECT * FROM validation_runs WHERE id = ?').get(v2Outcome.validationRunId) as {
      id: number;
      repair_id: number;
      run_id: number;
      verdict: string;
      oracle_summary_json: string;
    };
    expect(valRunRow).toBeDefined();
    expect(valRunRow.verdict).toBe('HEALED_PASS');

    const oracleResults = db
      .prepare('SELECT * FROM oracle_results WHERE validation_run_id = ?')
      .all(v2Outcome.validationRunId) as Array<{
      id: number;
      oracle: string;
      ok: number;
      detail_json: string;
    }>;

    expect(oracleResults.length).toBeGreaterThan(0);
    for (const r of oracleResults) {
      expect(r.oracle).toBeTruthy();
      expect(r.ok).toBe(1);
    }
  });

  it('[R-F3-07] change_id → repair_id → validation_run_id links are present', async () => {
    const { db, path: dbPath } = tempDb();

    await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
    });

    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });

    const link = db.prepare(`
      SELECT
        c.id as change_id,
        r.id as repair_id,
        r.step_plan_id as step_plan_id,
        vr.id as validation_run_id,
        vr.run_id as val_run_id
      FROM changes c
      JOIN repairs r ON r.change_id = c.id
      JOIN validation_runs vr ON vr.repair_id = r.id
      WHERE r.id = ?
    `).get(v2Outcome.repairId) as {
      change_id: number;
      repair_id: number;
      step_plan_id: number;
      validation_run_id: number;
      val_run_id: number;
    } | undefined;

    expect(link).toBeDefined();
    expect(link!.change_id).toBeGreaterThan(0);
    expect(link!.repair_id).toBe(v2Outcome.repairId);
    expect(link!.step_plan_id).toBeGreaterThan(0);
    expect(link!.validation_run_id).toBe(v2Outcome.validationRunId);
    expect(link!.val_run_id).toBeGreaterThan(0);
  });
});
