import { describe, it, expect, afterAll } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { runIntent } from '../../src/pipeline/run.js';

describe('Repair engine integration — T11', { timeout: 90000 }, () => {
  let fV1: { url: string; stop(): Promise<void> } | undefined;
  let fV2: { url: string; stop(): Promise<void> } | undefined;
  let fV2Ambig: { url: string; stop(): Promise<void> } | undefined;

  afterAll(async () => {
    if (fV1) await fV1.stop();
    if (fV2) await fV2.stop();
    if (fV2Ambig) await fV2Ambig.stop();
  });

  it('[R-F2-01] replaying the v1 plan on v2 repairs "Add to cart" to the observed "Add to bag" element', async () => {
    fV1 = await startFixture('shop-v1', '4101');
    fV2 = await startFixture('shop-v2', '4102');

    const { db, path: dbPath } = tempDb();

    // 1. Run baseline on v1
    const baselineOutcome = await runIntent('intents/checkout.intent.yaml', fV1.url, {
      db: dbPath,
      headless: true,
    });
    expect(baselineOutcome.verdict).toBe('PASS');

    // 2. Run replay on v2
    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2.url, {
      db: dbPath,
      headless: true,
    });

    expect(v2Outcome.verdict).toBe('HEALED_PASS');
    expect(v2Outcome.exitCode).toBe(0);

    // Verify change recorded
    const changes = db.prepare('SELECT * FROM changes').all() as Array<{
      id: number;
      kind: string;
      explanation: string;
      affected_steps_json: string;
    }>;

    expect(changes.length).toBeGreaterThan(0);
    const matchChange = changes.find(
      c => c.explanation.toLowerCase().includes('add to cart') && c.explanation.toLowerCase().includes('add to bag')
    );
    expect(matchChange).toBeDefined();
  });

  it('[R-F2-02] repaired step stores the new selector and target snapshotId', async () => {
    fV1 = fV1 ?? (await startFixture('shop-v1', '4101'));
    fV2 = fV2 ?? (await startFixture('shop-v2', '4102'));

    const { db, path: dbPath } = tempDb();

    await runIntent('intents/checkout.intent.yaml', fV1.url, {
      db: dbPath,
      headless: true,
    });

    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2.url, {
      db: dbPath,
      headless: true,
    });

    expect(v2Outcome.repairId).not.toBeNull();

    const repairRow = db.prepare('SELECT * FROM repairs WHERE id = ?').get(v2Outcome.repairId) as {
      id: number;
      proposal_json: string;
      status: string;
    };
    expect(repairRow).toBeDefined();

    const proposal = JSON.parse(repairRow.proposal_json);
    const steps = proposal.steps as Array<{
      stepId: string;
      provenance: string;
      target: { selector: string; snapshotId: number; name: string };
    }>;

    const repairedStep = steps.find(s => s.provenance === 'repair-match');
    expect(repairedStep).toBeDefined();
    expect(repairedStep!.target.selector).toBeTruthy();
    expect(repairedStep!.target.snapshotId).toBeGreaterThan(0);
  });

  it('[R-F1-05] replaying v1 plan on v2 records FLOW_CHANGED when card fields are not on the details page', async () => {
    fV1 = fV1 ?? (await startFixture('shop-v1', '4101'));
    fV2 = fV2 ?? (await startFixture('shop-v2', '4102'));

    const { db, path: dbPath } = tempDb();

    await runIntent('intents/checkout.intent.yaml', fV1.url, {
      db: dbPath,
      headless: true,
    });

    await runIntent('intents/checkout.intent.yaml', fV2.url, {
      db: dbPath,
      headless: true,
    });

    const flowChanges = db.prepare("SELECT * FROM changes WHERE kind = 'FLOW_CHANGED'").all() as Array<{
      id: number;
      kind: string;
      explanation: string;
      affected_steps_json: string;
    }>;

    expect(flowChanges.length).toBeGreaterThan(0);
    const affected = JSON.parse(flowChanges[0].affected_steps_json);
    expect(Array.isArray(affected)).toBe(true);
    expect(affected.length).toBeGreaterThan(0);
  });

  it('[R-PS-03] each change explanation names the old step, the evidence and the new target', async () => {
    fV1 = fV1 ?? (await startFixture('shop-v1', '4101'));
    fV2 = fV2 ?? (await startFixture('shop-v2', '4102'));

    const { db, path: dbPath } = tempDb();

    await runIntent('intents/checkout.intent.yaml', fV1.url, {
      db: dbPath,
      headless: true,
    });

    await runIntent('intents/checkout.intent.yaml', fV2.url, {
      db: dbPath,
      headless: true,
    });

    const changes = db.prepare('SELECT * FROM changes').all() as Array<{
      id: number;
      kind: string;
      explanation: string;
    }>;

    const matchChange = changes.find(c => c.kind !== 'FLOW_CHANGED');
    expect(matchChange).toBeDefined();
    // PRD §10.7 template: "Step {stepId} ({action} '{oldName}' via {oldSelector}) no longer matches: {item.evidence}. Goal '{goal}' is still reachable via {newRole} '{newName}' ({ref}), score {score:.2f}."
    expect(matchChange!.explanation).toMatch(/^Step s\d+/);
    expect(matchChange!.explanation).toContain('no longer matches');
    expect(matchChange!.explanation).toContain('still reachable via');
  });

  it('[R-SC-C] v2-ambiguous → needs_review repair with ≥2 candidates and run stops', async () => {
    fV1 = fV1 ?? (await startFixture('shop-v1', '4101'));
    fV2Ambig = await startFixture('shop-v2-ambiguous', '4104');

    const { db, path: dbPath } = tempDb();

    // Baseline on v1
    await runIntent('intents/checkout.intent.yaml', fV1.url, {
      db: dbPath,
      headless: true,
    });

    // Replay on v2-ambiguous
    const outcome = await runIntent('intents/checkout.intent.yaml', fV2Ambig.url, {
      db: dbPath,
      headless: true,
    });

    expect(outcome.verdict).toBe('NEEDS_REVIEW');
    expect(outcome.exitCode).toBe(11);
    expect(outcome.classification).toBe('AMBIGUOUS');
    expect(outcome.repairId).not.toBeNull();

    const repairRow = db.prepare('SELECT * FROM repairs WHERE id = ?').get(outcome.repairId) as {
      id: number;
      status: string;
      proposal_json: string;
    };

    expect(repairRow.status).toBe('needs_review');
    const proposal = JSON.parse(repairRow.proposal_json);
    expect(proposal.pendingChoice).toBeDefined();
    expect(proposal.pendingChoice.candidates.length).toBeGreaterThanOrEqual(2);
  });
});
