import { describe, it, expect, afterAll } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { runIntent } from '../../src/pipeline/run.js';

describe('Run v1 baseline integration — T10', { timeout: 60000 }, () => {
  let fixture: { url: string; stop(): Promise<void> } | undefined;

  afterAll(async () => {
    if (fixture) await fixture.stop();
  });

  it('[R-PS-07] run on v1 with empty DB → PASS exit 0 and baseline plan + known_good stored', async () => {
    fixture = await startFixture('shop-v1', '4101');

    const { db, path } = tempDb();

    const outcome = await runIntent('intents/checkout.intent.yaml', fixture.url, {
      db: path,
      headless: true,
    });

    expect(outcome.verdict).toBe('PASS');
    expect(outcome.exitCode).toBe(0);

    // Verify step_plans row with origin baseline was stored
    const plans = db
      .prepare("SELECT * FROM step_plans WHERE origin = 'baseline'")
      .all() as Array<{ id: number; origin: string; steps_json: string }>;
    expect(plans).toHaveLength(1);

    const steps = JSON.parse(plans[0].steps_json);
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);

    // Verify known_good row was stored
    const knownGoodRows = db.prepare('SELECT * FROM known_good').all() as Array<{
      id: number;
      step_plan_id: number;
    }>;
    expect(knownGoodRows).toHaveLength(1);
    expect(knownGoodRows[0].step_plan_id).toBe(plans[0].id);
  });
});
