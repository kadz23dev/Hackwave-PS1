/**
 * Validation loop — PRD §11 step 7
 * Reruns the repaired plan in a fresh browser context against the original intent oracles.
 * Strictly no matcher or planner calls (G5, G6).
 */

import type { Repo } from '../db/repo.js';
import { parseIntent } from '../intent/load.js';
import { openSession } from '../browser/session.js';
import { captureSnapshot } from '../snapshot/capture.js';
import { resolveBySelector } from '../match/matcher.js';
import { executeStep } from '../executor/executor.js';
import { runOracles } from '../oracle/runner.js';
import { decideVerdict } from '../classify/verdict.js';
import { loadPolicy, type Policy } from '../governance/policy.js';
import type { OracleResult, Step, Verdict } from '../types.js';

export interface ValidationOptions {
  target?: string;
  headless?: boolean;
  policy?: Policy;
}

export interface ValidationOutcome {
  runId: number;
  validationRunId: number;
  verdict: Verdict;
  oracleResults: OracleResult[];
}

export async function runValidation(
  repo: Repo,
  repairId: number,
  opts?: ValidationOptions
): Promise<ValidationOutcome> {
  // 1. Load repair, step plan, intent, and site
  const repair = repo.getRepair(repairId);
  if (!repair) {
    throw new Error(`Repair #${repairId} not found`);
  }
  if (!repair.step_plan_id) {
    throw new Error(`Repair #${repairId} has no step_plan_id`);
  }

  const stepPlan = repo.getStepPlan(repair.step_plan_id);
  if (!stepPlan) {
    throw new Error(`Step plan #${repair.step_plan_id} not found`);
  }

  const intentRow = repo.getIntent(stepPlan.intent_id);
  if (!intentRow) {
    throw new Error(`Intent #${stepPlan.intent_id} not found`);
  }

  const { intent, sha256 } = parseIntent(intentRow.body);
  if (sha256 !== intentRow.sha256) {
    throw new Error(`Intent sha256 mismatch: calculated ${sha256} vs stored ${intentRow.sha256}`);
  }

  const site = repo.getSite(stepPlan.site_id);
  const target = opts?.target ?? site?.base_url;
  if (!target) {
    throw new Error('No target URL available for validation');
  }

  const targetOrigin = new URL(target).origin;

  // 2. Reset fixture state if endpoint exists
  try {
    await fetch(`${targetOrigin}/__reset`, { method: 'POST' });
  } catch {
    // Ignore error for non-fixture sites
  }

  // 3. Open NEW browser session with isolated context
  const session = await openSession({
    headless: opts?.headless ?? true,
    intent,
  });

  try {
    // 4. Insert run record of kind 'validation'
    const runId = repo.insertRun({
      intentId: intentRow.id,
      intentSha: sha256,
      kind: 'validation',
      targetOrigin,
    });

    // 5. Navigate to startPath
    const startUrl = `${target.replace(/\/$/, '')}${intent.startPath}`;
    await session.page.goto(startUrl);

    const steps: Step[] = Array.isArray(stepPlan.steps)
      ? stepPlan.steps
      : (typeof stepPlan.steps_json === 'string' ? JSON.parse(stepPlan.steps_json) : []);

    const policy = opts?.policy ?? loadPolicy();
    const pageIdFor = (path: string) => repo.upsertPage(stepPlan.site_id, path).id;

    let plannerStatus: 'done' | 'stuck' = 'done';
    let appError = false;

    // 6. Strict replay of each step using resolveBySelector ONLY
    for (const step of steps) {
      const snap = await captureSnapshot(session.page, { screenshot: true });
      const snapId = repo.insertSnapshot(pageIdFor(snap.pagePath), 'validation', snap);
      snap.id = snapId;

      const el = await resolveBySelector(session.page, snap, step.target, policy);
      if (!el) {
        plannerStatus = 'stuck';
        break;
      }

      await executeStep(session.page, step, el, intent, snap);
      await session.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

      if (session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500)) {
        appError = true;
        break;
      }
    }

    // 7. Run oracles
    const oracles = await runOracles(intent, targetOrigin, session.network, session.page);

    // 8. Decide verdict (repaired: true)
    const replanned = steps.some(s => s.provenance === 'repair-replan');
    const v = decideVerdict({
      toolError: false,
      appError: appError || session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500),
      oracleResults: oracles,
      plannerStatus,
      guardViolation: session.violations.length > 0,
      repaired: true,
      replanned,
      ambiguous: false,
      reusedRepair: false,
      planIsKnownGood: false,
    });

    // 9. Insert validation_run and oracle_results
    const summary = {
      verdict: v.verdict,
      exitCode: v.exitCode,
      oracleCount: oracles.length,
      passedCount: oracles.filter(o => o.ok).length,
    };
    const validationRunId = repo.insertValidationRun(repairId, runId, v.verdict, summary);
    repo.insertOracleResults(validationRunId, oracles);

    // 10. Finish run
    const explanation = `Validation finished with verdict ${v.verdict}.`;
    repo.finishRun(runId, {
      verdict: v.verdict,
      explanation,
      llmCalls: 0,
      evidence: [],
    });

    const oracleSummaryStr = oracles.map(o => `${o.oracleId} ${o.ok ? '✓' : '✗'}`).join(' · ');
    console.log(`[validate] run #${runId} fresh context · ${oracleSummaryStr}`);

    return {
      runId,
      validationRunId,
      verdict: v.verdict,
      oracleResults: oracles,
    };
  } finally {
    await session.close();
  }
}
