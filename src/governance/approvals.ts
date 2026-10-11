/**
 * Approval actions and repair governance transitions — PRD §11
 */

import type { Repo } from '../db/repo.js';
import { parseIntent } from '../intent/load.js';
import { openSession } from '../browser/session.js';
import { captureSnapshot } from '../snapshot/capture.js';
import { resolveBySelector } from '../match/matcher.js';
import { executeStep } from '../executor/executor.js';
import { runOracles } from '../oracle/runner.js';
import { decideVerdict } from '../classify/verdict.js';
import { planAndExecute } from '../planner/plan.js';
import { runValidation, type ValidationOutcome } from '../validate/validation.js';
import { loadPolicy } from './policy.js';
import { elementToTarget } from '../match/score.js';
import { makeLlm } from '../llm/client.js';
import type { ElementRecord, Step } from '../types.js';

export class InvalidTransition extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransition';
  }
}

/**
 * Approve a repair. Requires status 'validated'.
 * Status: approved -> applied, and inserts a known_good row.
 */
export function approve(
  repo: Repo,
  repairId: number,
  actor: string,
  reason: string
): { approved: boolean } {
  const repair = repo.getRepair(repairId);
  if (!repair) {
    throw new Error(`Repair #${repairId} not found`);
  }
  if (repair.status !== 'validated') {
    throw new InvalidTransition(`Cannot approve repair in status '${repair.status}', expected 'validated'`);
  }

  // 1. Record approval
  repo.insertApproval(repairId, 'approve', actor, reason);

  // 2. Set status to 'approved'
  repo.setRepairStatus(repairId, 'approved', actor, reason);

  // 3. Promote plan to known_good
  if (!repair.step_plan_id) {
    throw new Error(`Repair #${repairId} has no associated step_plan_id`);
  }
  const stepPlan = repo.getStepPlan(repair.step_plan_id);
  if (!stepPlan) {
    throw new Error(`Step plan #${repair.step_plan_id} not found`);
  }

  const intentRow = repo.getIntent(stepPlan.intent_id);
  if (!intentRow) {
    throw new Error(`Intent #${stepPlan.intent_id} not found`);
  }
  const { intent } = parseIntent(intentRow.body);
  const page = repo.upsertPage(stepPlan.site_id, intent.startPath);

  let snapRow = repo.db
    .prepare('SELECT id FROM snapshots WHERE page_id = ? AND content_hash = ?')
    .get(page.id, stepPlan.start_hash) as { id: number } | undefined;
  if (!snapRow) {
    snapRow = repo.db
      .prepare('SELECT id FROM snapshots WHERE page_id = ? ORDER BY id DESC LIMIT 1')
      .get(page.id) as { id: number } | undefined;
  }
  const snapshotId = snapRow?.id ?? 1;

  repo.insertKnownGood(page.id, snapshotId, repairId, repair.step_plan_id, actor);

  // 4. Set status to 'applied'
  repo.setRepairStatus(repairId, 'applied', actor, reason);

  return { approved: true };
}

/**
 * Reject a repair. Requires status 'proposed', 'needs_review', or 'validated'.
 */
export function reject(
  repo: Repo,
  repairId: number,
  actor: string,
  reason: string
): { rejected: boolean } {
  const repair = repo.getRepair(repairId);
  if (!repair) {
    throw new Error(`Repair #${repairId} not found`);
  }
  if (!['proposed', 'needs_review', 'validated'].includes(repair.status)) {
    throw new InvalidTransition(`Cannot reject repair in status '${repair.status}'`);
  }

  repo.insertApproval(repairId, 'reject', actor, reason);
  repo.setRepairStatus(repairId, 'rejected', actor, reason);

  return { rejected: true };
}

/**
 * Retry validation on a repair. Allowed only from 'validated' or 'proposed'.
 */
export async function retry(
  repo: Repo,
  repairId: number,
  opts?: { target?: string; headless?: boolean }
): Promise<ValidationOutcome> {
  const repair = repo.getRepair(repairId);
  if (!repair) {
    throw new Error(`Repair #${repairId} not found`);
  }
  if (!['validated', 'proposed'].includes(repair.status)) {
    throw new InvalidTransition(`Cannot retry repair in status '${repair.status}'`);
  }

  const outcome = await runValidation(repo, repairId, opts);
  const isValidated = outcome.verdict === 'PASS' || outcome.verdict === 'HEALED_PASS';
  repo.setRepairStatus(
    repairId,
    isValidated ? 'validated' : 'rejected',
    'system:validator',
    `Retry validation verdict: ${outcome.verdict}`
  );

  return outcome;
}

/**
 * Rollback an applied repair. Requires status 'applied'.
 * Reverts status to 'rolled_back' and inserts a known_good row pointing to the previous plan.
 */
export function rollback(
  repo: Repo,
  repairId: number,
  actor: string,
  reason: string
): { rolledBack: boolean } {
  const repair = repo.getRepair(repairId);
  if (!repair) {
    throw new Error(`Repair #${repairId} not found`);
  }
  if (repair.status !== 'applied') {
    throw new InvalidTransition(`Cannot rollback repair in status '${repair.status}', expected 'applied'`);
  }

  repo.insertApproval(repairId, 'rollback', actor, reason);
  repo.setRepairStatus(repairId, 'rolled_back', actor, reason);

  // Look up previous known_good row pointing to a different step_plan_id
  const prevKg = repo.db
    .prepare(`
      SELECT * FROM known_good
      WHERE (step_plan_id != ? OR step_plan_id IS NULL)
      ORDER BY id DESC LIMIT 1
    `)
    .get(repair.step_plan_id ?? -1) as
    | { page_id: number; snapshot_id: number; step_plan_id: number | null }
    | undefined;

  if (prevKg) {
    repo.insertKnownGood(prevKg.page_id, prevKg.snapshot_id, null, prevKg.step_plan_id, actor);
  }

  return { rolledBack: true };
}

/**
 * Resolve an ambiguous repair choice by selecting a candidate.
 * Requires status 'needs_review'. Validates that candidateRef is in pendingChoice.candidates (G2).
 */
export async function resolveCandidate(
  repo: Repo,
  repairId: number,
  candidateRef: string,
  actor: string,
  opts?: { target?: string; headless?: boolean }
): Promise<{ verdict: string; validationRunId?: number; stepPlanId?: number; steps?: Step[] }> {
  const repair = repo.getRepair(repairId);
  if (!repair) {
    throw new Error(`Repair #${repairId} not found`);
  }
  if (repair.status !== 'needs_review') {
    throw new InvalidTransition(`Cannot resolve repair in status '${repair.status}', expected 'needs_review'`);
  }

  const proposal = repair.proposal as
    | {
        steps?: Step[];
        pendingChoice?: { stepId: string; candidates: ElementRecord[] } | null;
      }
    | undefined;

  if (!proposal?.pendingChoice?.candidates) {
    throw new Error(`Repair #${repairId} has no pendingChoice candidates`);
  }

  const candidates = proposal.pendingChoice.candidates;
  const chosenCandidate = candidates.find(c => c.ref === candidateRef);
  if (!chosenCandidate) {
    throw new Error(
      `Candidate ref '${candidateRef}' is not among stored candidates: ${candidates.map(c => c.ref).join(', ')}`
    );
  }

  const stepPlan = repair.step_plan_id ? repo.getStepPlan(repair.step_plan_id) : null;
  let intentId = stepPlan?.intent_id;
  let siteId = stepPlan?.site_id;
  let startHash = stepPlan?.start_hash ?? '';

  if (!intentId || !siteId) {
    const prevPlan = repo.db
      .prepare('SELECT intent_id, site_id, start_hash FROM step_plans ORDER BY id DESC LIMIT 1')
      .get() as { intent_id: number; site_id: number; start_hash: string } | undefined;
    if (prevPlan) {
      intentId = intentId ?? prevPlan.intent_id;
      siteId = siteId ?? prevPlan.site_id;
      startHash = startHash || prevPlan.start_hash;
    } else {
      intentId = intentId ?? 1;
      siteId = siteId ?? 1;
    }
  }

  const intentRow = repo.getIntent(intentId);
  if (!intentRow) {
    throw new Error(`Intent #${intentId} not found`);
  }
  const { intent, sha256 } = parseIntent(intentRow.body);
  const site = repo.getSite(siteId);

  const lastRun = repo.db
    .prepare("SELECT target_origin FROM runs WHERE length(target_origin) > 0 ORDER BY id DESC LIMIT 1")
    .get() as { target_origin: string } | undefined;
  const target = opts?.target ?? site?.base_url ?? lastRun?.target_origin;
  if (!target) {
    throw new Error('Target URL not available for candidate resolution');
  }
  const targetOrigin = new URL(target).origin;

  if (!startHash) {
    const page = repo.upsertPage(siteId, intent.startPath);
    const snapRow = repo.db
      .prepare('SELECT content_hash FROM snapshots WHERE page_id = ? ORDER BY id ASC LIMIT 1')
      .get(page.id) as { content_hash: string } | undefined;
    startHash = snapRow?.content_hash ?? '';
  }

  const change = repo.getChange(repair.change_id);
  const snapId =
    (chosenCandidate as { snapshotId?: number }).snapshotId ?? change?.head_snapshot_id ?? 0;
  const storedSnap = snapId > 0 ? repo.getSnapshot(snapId) : null;
  const storedElements = (storedSnap?.elements as ElementRecord[]) ?? [];
  const storedElement = storedElements.find(e => e.ref === candidateRef);

  const elementForTarget = storedElement ?? (chosenCandidate as ElementRecord);
  const targetFingerprint = elementToTarget(elementForTarget, snapId);

  const lastProposalStep =
    proposal.steps && proposal.steps.length > 0
      ? proposal.steps[proposal.steps.length - 1]
      : undefined;
  const pagePath =
    storedSnap?.pagePath ?? lastProposalStep?.pagePath ?? intent.startPath;

  // Build the chosen step
  const chosenStep: Step = {
    stepId: proposal.pendingChoice.stepId || `s${(proposal.steps || []).length + 1}`,
    action: 'click',
    pagePath,
    target: targetFingerprint,
    dataKey: null,
    provenance: 'human',
  };

  const baseSteps: Step[] = [...(proposal.steps || []), chosenStep];

  // Reset fixture state
  try {
    await fetch(`${targetOrigin}/__reset`, { method: 'POST' });
  } catch {
    // Ignore error
  }

  // Open fresh session
  const session = await openSession({ headless: opts?.headless ?? true, intent });

  try {
    const runId = repo.insertRun({
      intentId,
      intentSha: sha256,
      kind: 'validation',
      targetOrigin,
    });

    const startUrl = `${target.replace(/\/$/, '')}${intent.startPath}`;
    await session.page.goto(startUrl);

    const policy = loadPolicy();
    const pageIdFor = (path: string) => repo.upsertPage(siteId, path).id;

    let executedSteps: Step[] = [];

    // Replay baseSteps
    for (const step of baseSteps) {
      const snap = await captureSnapshot(session.page, { screenshot: true });
      const snapId = repo.insertSnapshot(pageIdFor(snap.pagePath), 'validation', snap);
      snap.id = snapId;

      const el = await resolveBySelector(session.page, snap, step.target, policy);
      if (!el) {
        throw new Error(`Step '${step.stepId}' failed to resolve during candidate replay`);
      }

      await executeStep(session.page, step, el, intent, snap);
      await session.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      executedSteps.push(step);
    }

    // Continue until doneWhen if not already reached
    const currentUrlPath = new URL(session.page.url()).pathname;
    const isDone = new RegExp(intent.planner.doneWhen.pathPattern).test(currentUrlPath);

    if (!isDone) {
      const r = await planAndExecute(session, intent, repo, {
        repair: true,
        completed: executedSteps,
        pageIdFor,
        llm: makeLlm('off'),
        llmMode: 'off',
      });

      if (r.status === 'ambiguous' && r.ambiguity) {
        // Stays in needs_review with new pendingChoice
        const updatedProposal = {
          steps: [...executedSteps, ...r.steps],
          pendingChoice: {
            stepId: `s${executedSteps.length + r.steps.length + 1}`,
            candidates: r.ambiguity,
          },
        };
        repo.db
          .prepare('UPDATE repairs SET proposal_json = ? WHERE id = ?')
          .run(JSON.stringify(updatedProposal), repairId);

        return { verdict: 'NEEDS_REVIEW' };
      }

      executedSteps = [...executedSteps, ...r.steps];
    }

    // Renumber steps
    const finalSteps = executedSteps.map((s, idx) => ({ ...s, stepId: `s${idx + 1}` }));

    // Store new step plan
    const newStepPlanId = repo.insertStepPlan(
      {
        intentId,
        siteId,
        steps: finalSteps,
        origin: 'repair',
        repairId,
        startHash,
      },
      actor
    );

    repo.db
      .prepare('UPDATE repairs SET step_plan_id = ?, proposal_json = ? WHERE id = ?')
      .run(newStepPlanId, JSON.stringify({ steps: finalSteps, pendingChoice: null }), repairId);

    const oracles = await runOracles(intent, targetOrigin, session.network, session.page);
    const has5xx = session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500);

    const v = decideVerdict({
      toolError: false,
      appError: has5xx || oracles.some(r => !r.supportingOnly && !r.ok),
      oracleResults: oracles,
      plannerStatus: 'done',
      guardViolation: session.violations.length > 0,
      repaired: true,
      replanned: true,
      ambiguous: false,
      reusedRepair: false,
      planIsKnownGood: false,
    });

    const valRunId = repo.insertValidationRun(repairId, runId, v.verdict, { verdict: v.verdict });
    repo.insertOracleResults(valRunId, oracles);
    repo.finishRun(runId, {
      verdict: v.verdict,
      explanation: 'Resolved candidate validation',
      llmCalls: 0,
      evidence: [],
    });

    if (v.verdict === 'PASS' || v.verdict === 'HEALED_PASS') {
      repo.setRepairStatus(repairId, 'validated', actor, 'Candidate resolved and validated');
    }

    return {
      verdict: v.verdict,
      validationRunId: valRunId,
      stepPlanId: newStepPlanId,
      steps: finalSteps,
    };
  } finally {
    await session.close();
  }
}
