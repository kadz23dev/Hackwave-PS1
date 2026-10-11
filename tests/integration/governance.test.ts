import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { runIntent } from '../../src/pipeline/run.js';
import { Repo } from '../../src/db/repo.js';
import { approve, reject, resolveCandidate } from '../../src/governance/approvals.js';
import { canAutoAccept, loadPolicy } from '../../src/governance/policy.js';

describe('Governance engine integration tests — T13', { timeout: 120000 }, () => {
  let fV1: { url: string; stop(): Promise<void> } | undefined;
  let fV2: { url: string; stop(): Promise<void> } | undefined;
  let fV2Ambig: { url: string; stop(): Promise<void> } | undefined;

  beforeAll(async () => {
    fV1 = await startFixture('shop-v1', '4101');
    fV2 = await startFixture('shop-v2', '4102');
    fV2Ambig = await startFixture('shop-v2-ambiguous', '4104');
  });

  afterAll(async () => {
    if (fV1) await fV1.stop();
    if (fV2) await fV2.stop();
    if (fV2Ambig) await fV2Ambig.stop();
  });

  it('[R-PIPE-01] second v2 run reuses the validated repair with 0 LLM calls and HEALED_PASS', async () => {
    const { db, path: dbPath } = tempDb();
    const repo = new Repo(db);

    // 1. Baseline on v1
    const baseline = await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
    });
    expect(baseline.verdict).toBe('PASS');

    // 2. First v2 run: heals and creates validated repair
    const v2First = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });
    expect(v2First.verdict).toBe('HEALED_PASS');
    expect(v2First.repairId).not.toBeNull();

    const repairRow = repo.getRepair(v2First.repairId!);
    expect(repairRow?.status).toBe('validated');

    // 3. Second v2 run: reuses the validated repair
    const v2Second = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });
    expect(v2Second.verdict).toBe('HEALED_PASS');
    expect(v2Second.exitCode).toBe(0);
    expect(v2Second.llmCalls).toBe(0);
    expect(v2Second.reusedRepairId).toBe(v2First.repairId);

    const secondRunRow = db
      .prepare('SELECT llm_calls, reused_repair_id, verdict FROM runs WHERE id = ?')
      .get(v2Second.runId) as { llm_calls: number; reused_repair_id: number; verdict: string };
    expect(secondRunRow.llm_calls).toBe(0);
    expect(secondRunRow.reused_repair_id).toBe(v2First.repairId);
    expect(secondRunRow.verdict).toBe('HEALED_PASS');
  });

  it('after approve, a v2 run returns PASS (repair is known-good)', async () => {
    const { db, path: dbPath } = tempDb();
    const repo = new Repo(db);

    // 1. Baseline on v1
    await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
    });

    // 2. First v2 run: heals to validated repair
    const v2First = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });
    expect(v2First.verdict).toBe('HEALED_PASS');
    const repairId = v2First.repairId!;

    // 3. Approve repair
    const appResult = approve(repo, repairId, 'alice@example.com', 'manual review passed');
    expect(appResult.approved).toBe(true);

    const rep = repo.getRepair(repairId);
    expect(rep?.status).toBe('applied');

    // 4. Run on v2 now should return PASS
    const v2AfterApprove = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });
    expect(v2AfterApprove.verdict).toBe('PASS');
    expect(v2AfterApprove.exitCode).toBe(0);
  });

  it('[R-F3-05] approve and reject write approvals rows with actor and reason', async () => {
    const { db, path: dbPath } = tempDb();
    const repo = new Repo(db);

    // 1. Run baseline and heal on v2
    await runIntent('intents/checkout.intent.yaml', fV1!.url, { db: dbPath, headless: true });
    const healRun = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });
    const repairId = healRun.repairId!;

    // Approve writes approval row
    approve(repo, repairId, 'lead-dev', 'approved after inspection');
    const appRow = db
      .prepare("SELECT * FROM approvals WHERE repair_id = ? AND decision = 'approve'")
      .get(repairId) as { actor: string; reason: string; decision: string };
    expect(appRow).toBeDefined();
    expect(appRow.actor).toBe('lead-dev');
    expect(appRow.reason).toBe('approved after inspection');

    // Reject on another repair
    const change = repo.getChange(1);
    const mockRepId = repo.insertRepair({
      changeId: change?.id ?? 1,
      proposer: 'heuristic',
      proposal: { steps: [] },
      status: 'proposed',
      explanation: 'mock proposal',
    });

    reject(repo, mockRepId, 'qa-eng', 'rejecting bad repair');
    const rejRow = db
      .prepare("SELECT * FROM approvals WHERE repair_id = ? AND decision = 'reject'")
      .get(mockRepId) as { actor: string; reason: string; decision: string };
    expect(rejRow).toBeDefined();
    expect(rejRow.actor).toBe('qa-eng');
    expect(rejRow.reason).toBe('rejecting bad repair');
  });

  it('HARMLESS_UI single-candidate repair is auto-applied by policy; BREAKING_UI is not', async () => {
    const policy = loadPolicy();

    // Policy check logic
    expect(canAutoAccept('HARMLESS_UI', 1, [{ ok: true }], policy)).toBe(true);
    expect(canAutoAccept('BREAKING_UI', 1, [{ ok: true }], policy)).toBe(false);
    expect(canAutoAccept('HARMLESS_UI', 2, [{ ok: true }], policy)).toBe(false);
    expect(canAutoAccept('HARMLESS_UI', 1, [{ ok: false }], policy)).toBe(false);

    // End-to-end DB check: v2 run is BREAKING_UI (flow replanned), so it is not auto-applied
    const { db, path: dbPath } = tempDb();
    const repo = new Repo(db);

    await runIntent('intents/checkout.intent.yaml', fV1!.url, { db: dbPath, headless: true });
    const v2Run = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
    });
    expect(v2Run.classification).toBe('BREAKING_UI');
    const repair = repo.getRepair(v2Run.repairId!);
    // BREAKING_UI requires manual approval, stays 'validated'
    expect(repair?.status).toBe('validated');
  });

  it("resolveCandidate on v2-ambiguous with 'Complete order' → validated", async () => {
    const { db, path: dbPath } = tempDb();
    const repo = new Repo(db);

    // 1. Baseline on v1
    await runIntent('intents/checkout.intent.yaml', fV1!.url, { db: dbPath, headless: true });

    // 2. Replay on v2-ambiguous
    const outcome = await runIntent('intents/checkout.intent.yaml', fV2Ambig!.url, {
      db: dbPath,
      headless: true,
    });
    expect(outcome.verdict).toBe('NEEDS_REVIEW');
    expect(outcome.classification).toBe('AMBIGUOUS');
    const repairId = outcome.repairId!;

    const repairRow = repo.getRepair(repairId);
    expect(repairRow?.status).toBe('needs_review');

    const proposal = repairRow?.proposal as {
      pendingChoice: { stepId: string; candidates: Array<{ ref: string; name: string }> };
    };
    expect(proposal.pendingChoice).toBeDefined();

    const completeOrderCand = proposal.pendingChoice.candidates.find(
      c => c.name.toLowerCase().includes('complete order') || c.name === 'Complete order'
    );
    expect(completeOrderCand).toBeDefined();

    // 3. Resolve candidate
    const resolveResult = await resolveCandidate(
      repo,
      repairId,
      completeOrderCand!.ref,
      'reviewer-sam',
      { target: fV2Ambig!.url, headless: true }
    );

    expect(resolveResult.verdict).toMatch(/PASS|HEALED_PASS/);

    const updatedRepair = repo.getRepair(repairId);
    expect(updatedRepair?.status).toBe('validated');

    // Now it can be approved
    const app = approve(repo, repairId, 'reviewer-sam', 'resolution accepted');
    expect(app.approved).toBe(true);
    expect(repo.getRepair(repairId)?.status).toBe('applied');
  });
});
