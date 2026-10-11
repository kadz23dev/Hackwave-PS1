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
import { decideVerdict, type VerdictDecision } from '../classify/verdict.js';
import { makeLlm } from '../llm/client.js';
import { replayWithRepair } from '../repair/engine.js';
import { loadPolicy, canAutoAccept } from '../governance/policy.js';
import { approve } from '../governance/approvals.js';
import { runValidation, type ValidationOutcome } from '../validate/validation.js';
import { explainVerdict, explainAmbiguous, maskSecrets } from '../explain/templates.js';
import type { OracleResult, RunOutcome, Step } from '../types.js';

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
    const explanation = maskSecrets(
      `Target origin '${targetOrigin}' is not in allowedOrigins: ${intent.allowedOrigins.join(', ')}`,
      intent
    );
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

    let changeIds: number[] = [];
    let repairId: number | null = null;
    let validationRunId: number | null = null;
    let valResult: ValidationOutcome | null = null;
    let repaired = false;
    let replanned = false;
    let executionAppError = false;
    let plannerStatus: 'done' | 'stuck' | 'ambiguous' | 'budget' | 'app_error' | 'replayed' = 'done';
    let executedSteps: Step[] = [];

    if (plan) {
      // 6b. Plan exists (replay with repair)
      console.log(`[intent]   ${intent.name} sha=${sha256.slice(0, 12)}  target=${target}`);
      console.log(`[plan]     reuse: planId=${plan.id} (${plan.steps.length} steps)`);

      const replayResult = await replayWithRepair(session, intent, plan.steps, repo, {
        policy: loadPolicy(),
        pageIdFor,
        llm,
        llmMode: opts?.llm ?? 'off',
      });

      changeIds = replayResult.changeIds;
      repaired = replayResult.repaired;
      replanned = replayResult.replanned;
      executionAppError = replayResult.appError;
      plannerStatus = replayResult.plannerStatus;
      executedSteps = replayResult.newSteps;

      if (replayResult.ambiguity) {
        const ambExplanation = explainAmbiguous(
          replayResult.ambiguity.stepId,
          replayResult.ambiguity.candidates,
          intent
        );
        repairId = repo.insertRepair({
          changeId: replayResult.changeIds[0],
          proposer: 'heuristic',
          proposal: { steps: replayResult.newSteps, pendingChoice: replayResult.ambiguity },
          status: 'needs_review',
          explanation: ambExplanation,
        });

        const storedChanges = replayResult.changeIds
          .map(id => repo.getChange(id))
          .filter((c): c is NonNullable<typeof c> => c !== null);
        const explanation = explainVerdict(
          { verdict: 'NEEDS_REVIEW', oracleResults: [] },
          storedChanges,
          { id: repairId, status: 'needs_review', explanation: ambExplanation },
          intent
        );
        repo.finishRun(runId, {
          verdict: 'NEEDS_REVIEW',
          explanation,
          llmCalls: llm.calls,
          evidence: [],
          reusedRepairId: plan?.repairId ?? null,
        });

        console.log(`[verdict]  NEEDS_REVIEW`);

        return {
          runId,
          verdict: 'NEEDS_REVIEW',
          exitCode: 11,
          classification: 'AMBIGUOUS',
          changeIds: replayResult.changeIds,
          repairId,
          validationRunId: null,
          reusedRepairId: plan?.repairId ?? null,
          llmCalls: llm.calls,
          explanation,
          oracleResults: [],
        };
      } else if (repaired) {
        const renumberedSteps = replayResult.newSteps.map((s, idx) => ({
          ...s,
          stepId: `s${idx + 1}`,
        }));
        const stepPlanId = repo.insertStepPlan(
          {
            intentId: intentRow.id,
            siteId: site.id,
            steps: renumberedSteps,
            origin: 'repair',
            startHash: startSnap.contentHash,
          },
          'system:repair'
        );
        const lastChangeId = changeIds[changeIds.length - 1];
        const proposer =
          renumberedSteps.some(s => s.provenance === 'llm') || replayResult.llmCalls > 0
            ? 'llm'
            : 'heuristic';
        repairId = repo.insertRepair({
          changeId: lastChangeId,
          proposer,
          proposal: { steps: renumberedSteps, pendingChoice: null },
          status: 'proposed',
          stepPlanId,
          explanation: 'Proposed repair',
        });

        valResult = await runValidation(repo, repairId, {
          target,
          headless: opts?.headless ?? true,
          policy: loadPolicy(),
        });
        validationRunId = valResult.validationRunId;

        const isValidated = valResult.verdict === 'PASS' || valResult.verdict === 'HEALED_PASS';
        repo.setRepairStatus(
          repairId,
          isValidated ? 'validated' : 'rejected',
          'system:validator',
          `Validation verdict: ${valResult.verdict}`
        );

        if (isValidated) {
          const classification = replanned ? 'BREAKING_UI' : 'HARMLESS_UI';
          const candidatesCount = 1;
          const policy = loadPolicy();
          if (canAutoAccept(classification, candidatesCount, valResult.oracleResults, policy)) {
            approve(repo, repairId, 'system:policy', 'auto-accept policy');
          }
        }
      }
    } else {
      // 6a. No plan (first run / baseline)
      console.log(`[intent]   ${intent.name} sha=${sha256.slice(0, 12)}  target=${target}`);
      console.log(`[plan]     reuse: none (baseline)`);

      const r = await planAndExecute(session, intent, repo, {
        repair: false,
        completed: [],
        llm,
        pageIdFor,
        llmMode: opts?.llm ?? 'off',
      });

      executedSteps = r.steps;
      plannerStatus = r.status;
      if (r.status === 'app_error') {
        executionAppError = true;
      }

      if (r.status === 'ambiguous') {
        const ambExplanation = explainAmbiguous('pending', r.ambiguity ?? [], intent);
        const cId = repo.insertChange({
          baseSnapshotId: startSnapId,
          headSnapshotId: startSnapId,
          kind: 'FLOW_CHANGED',
          severity: 'HIGH',
          classification: 'AMBIGUOUS',
          confidence: 0.5,
          evidence: [],
          affectedSteps: [],
          explanation: ambExplanation,
        });
        repairId = repo.insertRepair({
          changeId: cId,
          proposer: 'heuristic',
          proposal: { steps: r.steps, pendingChoice: { stepId: 'pending', candidates: r.ambiguity ?? [] } },
          status: 'needs_review',
          explanation: ambExplanation,
        });

        const changeObj = repo.getChange(cId);
        const explanation = explainVerdict(
          { verdict: 'NEEDS_REVIEW', oracleResults: [] },
          changeObj ? [changeObj] : [],
          { id: repairId, status: 'needs_review', explanation: ambExplanation },
          intent
        );
        repo.finishRun(runId, {
          verdict: 'NEEDS_REVIEW',
          explanation,
          llmCalls: llm.calls,
          evidence: [],
          reusedRepairId: null,
        });

        console.log(`[verdict]  NEEDS_REVIEW`);

        return {
          runId,
          verdict: 'NEEDS_REVIEW',
          exitCode: 11,
          classification: 'AMBIGUOUS',
          changeIds: [cId],
          repairId,
          validationRunId: null,
          reusedRepairId: null,
          llmCalls: llm.calls,
          explanation,
          oracleResults: [],
        };
      }
    }

    let oracles: OracleResult[];
    let verdictDecision: VerdictDecision;

    if (repaired && valResult) {
      oracles = valResult.oracleResults;
      const validationAppError =
        valResult.verdict === 'APP_BUG' ||
        valResult.oracleResults.some(r => !r.supportingOnly && !r.ok);

      verdictDecision = decideVerdict({
        toolError: false,
        appError: validationAppError || executionAppError,
        oracleResults: valResult.oracleResults,
        plannerStatus: valResult.verdict === 'FAIL_UNREPAIRABLE' ? 'stuck' : 'done',
        guardViolation: session.violations.length > 0,
        repaired: true,
        replanned,
        ambiguous: false,
        reusedRepair: plan ? plan.repairId != null : false,
        planIsKnownGood: false,
      });
    } else {
      oracles = await runOracles(intent, targetOrigin, session.network, session.page);

      const appError =
        session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500) ||
        executionAppError ||
        plannerStatus === 'app_error';

      verdictDecision = decideVerdict({
        toolError: false,
        appError,
        oracleResults: oracles,
        plannerStatus: plannerStatus === 'app_error' ? 'done' : plannerStatus,
        guardViolation: session.violations.length > 0,
        repaired: false,
        replanned: false,
        ambiguous: false,
        reusedRepair: plan ? plan.reusedRepairId != null : false,
        planIsKnownGood: plan ? plan.planIsKnownGood : false,
      });
    }

    if (!plan && verdictDecision.verdict === 'PASS') {
      const stepPlanId = repo.insertStepPlan(
        {
          intentId: intentRow.id,
          siteId: site.id,
          steps: executedSteps,
          origin: 'baseline',
          startHash: startSnap.contentHash,
        },
        'system:baseline'
      );
      repo.insertKnownGood(pageIdFor(startSnap.pagePath), startSnapId, null, stepPlanId, 'system:baseline');
    }

    const storedChanges = changeIds
      .map(id => repo.getChange(id))
      .filter((c): c is NonNullable<typeof c> => c !== null);
    const storedRepair = repairId ? repo.getRepair(repairId) : null;

    let failureDetail: string | undefined;
    let serverErrorSummary: string | undefined;
    if (verdictDecision.verdict === 'APP_BUG') {
      const failedOracle = oracles.find(o => !o.ok && !o.supportingOnly) ?? oracles.find(o => !o.ok);
      if (failedOracle) {
        const detailMsg = typeof failedOracle.detail?.reason === 'string'
          ? failedOracle.detail.reason
          : typeof failedOracle.detail?.error === 'string'
          ? failedOracle.detail.error
          : '';
        failureDetail = `${failedOracle.oracleId} count 0`;
        if (detailMsg) {
          failureDetail = `${failedOracle.oracleId}: ${detailMsg}`;
        }
      } else {
        failureDetail = 'expected backend state not achieved';
      }

      const netErr = session.network.find(n => n.status >= 500);
      if (netErr) {
        serverErrorSummary = `${netErr.method} ${netErr.path} 500`;
      }
    }

    const explanation = explainVerdict(
      {
        verdict: verdictDecision.verdict,
        oracleResults: oracles,
        failureDetail,
        serverErrorSummary,
      },
      storedChanges,
      storedRepair,
      intent
    );

    repo.finishRun(runId, {
      verdict: verdictDecision.verdict,
      explanation,
      llmCalls: llm.calls,
      evidence: { changeIds },
      reusedRepairId: plan?.reusedRepairId ?? null,
    });

    console.log(`[verdict]  ${verdictDecision.verdict}`);

    outcome = {
      runId,
      verdict: verdictDecision.verdict,
      exitCode: verdictDecision.exitCode,
      classification: verdictDecision.classification,
      changeIds,
      repairId,
      validationRunId,
      reusedRepairId: plan?.reusedRepairId ?? null,
      llmCalls: llm.calls,
      explanation,
      oracleResults: oracles,
    };
  } finally {
    await session.close();
  }

  return outcome;
}
