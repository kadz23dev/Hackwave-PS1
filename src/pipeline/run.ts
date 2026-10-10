/**
 * Orchestrator — PRD §11
 */

import { openDb } from '../db/index.js';
import { Repo } from '../db/repo.js';
import { loadIntent } from '../intent/load.js';
import { openSession } from '../browser/session.js';
import { captureSnapshot } from '../snapshot/capture.js';
import { findPlanForRun } from '../governance/reuse.js';
import { planAndExecute } from '../planner/plan.js';
import { runOracles } from '../oracle/runner.js';
import { decideVerdict } from '../classify/verdict.js';
import { makeLlm } from '../llm/client.js';
import type { RunOutcome } from '../types.js';

export async function runIntent(
  intentPath: string,
  target: string,
  opts?: { db?: string; llm?: string; headless?: boolean }
): Promise<RunOutcome> {
  const db = openDb(opts?.db);
  const repo = new Repo(db);
  const llm = makeLlm(opts?.llm ?? 'off');

  // 1. Load intent & validate target origin
  const { intent, sha256, raw } = loadIntent(intentPath);
  const site = repo.upsertSite(intent.site, target, intent.allowedOrigins);
  const intentRow = repo.upsertIntentVersion(intent.name, sha256, raw);

  const targetOrigin = new URL(target).origin;
  const originAllowed = intent.allowedOrigins.includes(targetOrigin);

  if (!originAllowed) {
    const runId = repo.insertRun({
      intentId: intentRow.id,
      intentSha: sha256,
      kind: 'run',
      targetOrigin,
    });
    const explanation = `Target origin '${targetOrigin}' is not in allowedOrigins: ${intent.allowedOrigins.join(', ')}`;
    repo.finishRun(runId, {
      verdict: 'FAIL_UNREPAIRABLE',
      explanation,
      llmCalls: 0,
      evidence: [],
    });
    console.log(`[intent]   ${intent.name} sha=${sha256.slice(0, 12)}  target=${target}`);
    console.log(`[verdict]  FAIL_UNREPAIRABLE`);
    return {
      runId,
      verdict: 'FAIL_UNREPAIRABLE',
      exitCode: 1,
      classification: null,
      changeIds: [],
      repairId: null,
      validationRunId: null,
      reusedRepairId: null,
      llmCalls: 0,
      explanation,
      oracleResults: [],
    };
  }

  // 2. Reset fixture state if endpoint exists
  try {
    await fetch(`${targetOrigin}/__reset`, { method: 'POST' });
  } catch {
    // Ignore error for non-fixture sites
  }

  // 3. Insert run record
  const runId = repo.insertRun({
    intentId: intentRow.id,
    intentSha: sha256,
    kind: 'run',
    targetOrigin,
  });

  // 4. Open browser session and navigate to startPath
  const session = await openSession({
    headless: opts?.headless ?? true,
    intent,
  });

  let outcome: RunOutcome;
  try {
    const startUrl = `${target.replace(/\/$/, '')}${intent.startPath}`;
    await session.page.goto(startUrl);

    const startSnap = await captureSnapshot(session.page, { screenshot: true });
    const pageIdFor = (path: string) => repo.upsertPage(site.id, path).id;
    const startSnapId = repo.insertSnapshot(pageIdFor(startSnap.pagePath), 'start', startSnap);
    startSnap.id = startSnapId;

    // 5. Check for reusable plan
    const plan = findPlanForRun(repo, intentRow.id, site.id, startSnap.contentHash);
    if (plan) {
      throw new Error('replay not implemented until T11');
    }

    // 6a. No plan (first run / baseline)
    console.log(`[intent]   ${intent.name} sha=${sha256.slice(0, 12)}  target=${target}`);
    console.log(`[plan]     reuse: none (baseline)`);

    const r = await planAndExecute(session, intent, repo, {
      repair: false,
      completed: [],
      llm,
      pageIdFor,
    });

    let changeId: number | null = null;
    let repairId: number | null = null;

    if (r.status === 'ambiguous') {
      changeId = repo.insertChange({
        baseSnapshotId: startSnapId,
        headSnapshotId: startSnapId,
        kind: 'FLOW_CHANGED',
        severity: 'HIGH',
        classification: 'AMBIGUOUS',
        confidence: 0.5,
        evidence: [],
        affectedSteps: [],
        explanation: 'Ambiguous replacement options during plan',
      });
      repairId = repo.insertRepair({
        changeId,
        proposer: 'heuristic',
        proposal: { steps: r.steps, pendingChoice: { stepId: 'pending', candidates: r.ambiguity ?? [] } },
        status: 'needs_review',
        explanation: 'Ambiguous action encountered',
      });
    }

    const oracles = await runOracles(intent, targetOrigin, session.network, session.page);

    const appError =
      session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500) ||
      r.status === 'app_error';

    const verdictDecision = decideVerdict({
      toolError: false,
      appError,
      oracleResults: oracles,
      plannerStatus: r.status === 'app_error' ? 'done' : r.status,
      guardViolation: session.violations.length > 0,
      repaired: false,
      replanned: false,
      ambiguous: r.status === 'ambiguous',
      reusedRepair: false,
      planIsKnownGood: false,
    });

    if (verdictDecision.verdict === 'PASS') {
      const stepPlanId = repo.insertStepPlan(
        {
          intentId: intentRow.id,
          siteId: site.id,
          steps: r.steps,
          origin: 'baseline',
          startHash: startSnap.contentHash,
        },
        'system:baseline'
      );
      repo.insertKnownGood(pageIdFor(startSnap.pagePath), startSnapId, null, stepPlanId, 'system:baseline');
    }

    const explanation =
      verdictDecision.verdict === 'PASS'
        ? 'Workflow completed successfully and all required oracles passed.'
        : `Run finished with verdict ${verdictDecision.verdict}.`;

    repo.finishRun(runId, {
      verdict: verdictDecision.verdict,
      explanation,
      llmCalls: llm.calls,
      evidence: [],
      reusedRepairId: null,
    });

    console.log(`[verdict]  ${verdictDecision.verdict}`);

    outcome = {
      runId,
      verdict: verdictDecision.verdict,
      exitCode: verdictDecision.exitCode,
      classification: verdictDecision.classification,
      changeIds: changeId != null ? [changeId] : [],
      repairId,
      validationRunId: null,
      reusedRepairId: null,
      llmCalls: llm.calls,
      explanation,
      oracleResults: oracles,
    };
  } finally {
    await session.close();
  }

  return outcome;
}
