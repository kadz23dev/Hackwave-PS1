import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { tempDb } from '../helpers/db.js';
import { Repo } from '../../src/db/repo.js';
import { approve, rollback, resolveCandidate, InvalidTransition } from '../../src/governance/approvals.js';
import { findPlanForRun } from '../../src/governance/reuse.js';
import type { Step } from '../../src/types.js';

const VALID_INTENT_YAML = readFileSync('intents/checkout.intent.yaml', 'utf8');

describe('Governance guardrails — G2, G6, G7 (T13)', () => {
  it('[R-F4-06] needs_review repair cannot be approved until a candidate is resolved and validated', () => {
    const { db } = tempDb();
    const repo = new Repo(db);

    const site = repo.upsertSite('shop', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101']);
    const page = repo.upsertPage(site.id, '/');
    const snapId = repo.insertSnapshot(page.id, 'test', {
      elements: [],
      ariaYaml: '',
      contentHash: 'hash1',
      screenshotPath: null,
    });
    repo.upsertIntentVersion('checkout-valid-card', 'sha1', VALID_INTENT_YAML);

    const changeId = repo.insertChange({
      baseSnapshotId: snapId,
      headSnapshotId: snapId,
      kind: 'FLOW_CHANGED',
      severity: 'HIGH',
      classification: 'AMBIGUOUS',
      confidence: 0.5,
      evidence: [],
      affectedSteps: [],
      explanation: 'Ambiguous change',
    });

    const repairId = repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: {
        steps: [],
        pendingChoice: {
          stepId: 's5',
          candidates: [{ ref: 'e1', name: 'Opt 1', role: 'button' }],
        },
      },
      status: 'needs_review',
      explanation: 'Waiting for review',
    });

    // 1. Attempting to approve while in 'needs_review' MUST throw InvalidTransition
    expect(() => approve(repo, repairId, 'alice', 'premature approval')).toThrow(InvalidTransition);
    expect(() => approve(repo, repairId, 'alice', 'premature approval')).toThrow(
      /Cannot approve repair in status 'needs_review', expected 'validated'/
    );

    // 2. Simulate validation pass
    const runId = repo.insertRun({
      intentId: 1,
      intentSha: 'sha1',
      kind: 'validation',
      targetOrigin: 'http://127.0.0.1:4101',
    });
    repo.insertValidationRun(repairId, runId, 'PASS', { ok: true });
    repo.setRepairStatus(repairId, 'validated', 'system:validator', 'validation passed');

    // Step plan linked to repair
    const stepPlanId = repo.insertStepPlan({
      intentId: 1,
      siteId: site.id,
      steps: [] as Step[],
      origin: 'repair',
      repairId,
      startHash: 'hash1',
    });
    db.prepare('UPDATE repairs SET step_plan_id = ? WHERE id = ?').run(stepPlanId, repairId);

    // 3. Now approve succeeds and sets status to 'applied'
    const appRes = approve(repo, repairId, 'alice', 'now validated');
    expect(appRes.approved).toBe(true);
    expect(repo.getRepair(repairId)?.status).toBe('applied');
  });

  it('[R-F4-07] rollback inserts a known_good row pointing to the previous plan and v2 run then replays the old plan', () => {
    const { db } = tempDb();
    const repo = new Repo(db);

    const site = repo.upsertSite('shop', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101']);
    const page = repo.upsertPage(site.id, '/');
    const snapId = repo.insertSnapshot(page.id, 'test', {
      elements: [],
      ariaYaml: '',
      contentHash: 'hash1',
      screenshotPath: null,
    });
    repo.upsertIntentVersion('checkout-valid-card', 'sha1', VALID_INTENT_YAML);

    // 1. Baseline step plan #1
    const baselinePlanId = repo.insertStepPlan({
      intentId: 1,
      siteId: site.id,
      steps: [{ stepId: 's1', action: 'click', pagePath: '/', target: { role: 'button', name: 'Old Button', tag: 'button', text: 'Old', label: '', attrs: {}, nearText: '', bbox: { x: 0, y: 0, w: 10, h: 10 }, selector: '#old', snapshotId: snapId, ref: 'e1' }, dataKey: null, provenance: 'planner' }],
      origin: 'baseline',
      startHash: 'hash1',
    });
    repo.insertKnownGood(page.id, snapId, null, baselinePlanId, 'system:baseline');

    const baselineKg = repo.currentKnownGood(1, site.id);
    expect(baselineKg?.step_plan_id).toBe(baselinePlanId);

    // 2. Repaired step plan #2
    const changeId = repo.insertChange({
      baseSnapshotId: snapId,
      headSnapshotId: snapId,
      kind: 'ELEMENT_RENAMED',
      severity: 'LOW',
      classification: 'HARMLESS_UI',
      confidence: 0.9,
      evidence: [],
      affectedSteps: ['s1'],
      explanation: 'Renamed',
    });

    const repairedPlanId = repo.insertStepPlan({
      intentId: 1,
      siteId: site.id,
      steps: [{ stepId: 's1', action: 'click', pagePath: '/', target: { role: 'button', name: 'New Button', tag: 'button', text: 'New', label: '', attrs: {}, nearText: '', bbox: { x: 0, y: 0, w: 10, h: 10 }, selector: '#new', snapshotId: snapId, ref: 'e2' }, dataKey: null, provenance: 'repair-match' }],
      origin: 'repair',
      startHash: 'hash1',
    });

    const repairId = repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: { steps: [] },
      status: 'proposed',
      stepPlanId: repairedPlanId,
      explanation: 'Repaired button',
    });

    // Validate the repair
    const valRunId = repo.insertRun({ intentId: 1, intentSha: 'sha1', kind: 'validation', targetOrigin: 'http://127.0.0.1:4101' });
    repo.insertValidationRun(repairId, valRunId, 'PASS', { ok: true });
    repo.setRepairStatus(repairId, 'validated', 'system:validator', 'passed');

    // Approve the repair -> status 'applied', known_good points to plan #2
    approve(repo, repairId, 'lead-dev', 'approved');
    expect(repo.getRepair(repairId)?.status).toBe('applied');

    const appliedKg = repo.currentKnownGood(1, site.id);
    expect(appliedKg?.step_plan_id).toBe(repairedPlanId);

    // 3. Rollback the repair
    const rollbackRes = rollback(repo, repairId, 'lead-dev', 'reverting to baseline');
    expect(rollbackRes.rolledBack).toBe(true);
    expect(repo.getRepair(repairId)?.status).toBe('rolled_back');

    // Verify a new known_good row was inserted pointing to baseline plan #1
    const rolledBackKg = repo.currentKnownGood(1, site.id);
    expect(rolledBackKg?.step_plan_id).toBe(baselinePlanId);

    // Verify approvals row recorded the rollback
    const rollbackApproval = db
      .prepare("SELECT * FROM approvals WHERE repair_id = ? AND decision = 'rollback'")
      .get(repairId) as { actor: string; reason: string; decision: string };
    expect(rollbackApproval).toBeDefined();
    expect(rollbackApproval.actor).toBe('lead-dev');
    expect(rollbackApproval.reason).toBe('reverting to baseline');

    // 4. Plan lookup now returns the old baseline plan #1, ignoring rolled_back repair
    const reusedPlan = findPlanForRun(repo, 1, site.id, 'hash1');
    expect(reusedPlan?.stepPlanId).toBe(baselinePlanId);
    expect(reusedPlan?.planIsKnownGood).toBe(true);
    expect(reusedPlan?.reusedRepairId).toBeNull();
  });

  it('resolveCandidate with a ref not among the stored candidates throws', async () => {
    const { db } = tempDb();
    const repo = new Repo(db);

    const site = repo.upsertSite('shop', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101']);
    const page = repo.upsertPage(site.id, '/');
    const snapId = repo.insertSnapshot(page.id, 'test', {
      elements: [],
      ariaYaml: '',
      contentHash: 'hash1',
      screenshotPath: null,
    });
    repo.upsertIntentVersion('checkout-valid-card', 'sha1', VALID_INTENT_YAML);

    const changeId = repo.insertChange({
      baseSnapshotId: snapId,
      headSnapshotId: snapId,
      kind: 'FLOW_CHANGED',
      severity: 'HIGH',
      classification: 'AMBIGUOUS',
      confidence: 0.5,
      evidence: [],
      affectedSteps: [],
      explanation: 'Ambiguous change',
    });

    const repairId = repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: {
        steps: [],
        pendingChoice: {
          stepId: 's5',
          candidates: [
            { ref: 'e10', name: 'Option A', role: 'button' },
            { ref: 'e11', name: 'Option B', role: 'button' },
          ],
        },
      },
      status: 'needs_review',
      explanation: 'Choice required',
    });

    // Calling resolveCandidate with an unobserved ref throws (G2)
    await expect(
      resolveCandidate(repo, repairId, 'e999_unobserved', 'auditor')
    ).rejects.toThrow(/Candidate ref 'e999_unobserved' is not among stored candidates: e10, e11/);
  });
});
