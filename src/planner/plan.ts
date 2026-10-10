/**
 * Plan and execute loop — PRD §10.4
 */

import type { Session } from '../browser/session.js';
import type { Candidate, Intent, Step, Provenance } from '../types.js';
import type { Repo } from '../db/repo.js';
import type { LlmClient } from '../llm/client.js';
import { captureSnapshot } from '../snapshot/capture.js';
import { nextAction } from './heuristic.js';
import { executeStep } from '../executor/executor.js';
import { elementToTarget } from '../match/score.js';
import { norm } from '../match/text.js';

export async function planAndExecute(
  session: Session,
  intent: Intent,
  repo: Repo,
  opts: {
    repair: boolean;
    completed: Step[];
    llm: LlmClient;
    pageIdFor(path: string): number;
  }
): Promise<{
  steps: Step[];
  status: 'done' | 'stuck' | 'ambiguous' | 'budget' | 'app_error';
  ambiguity?: Candidate[];
  llmCalls: number;
}> {
  const steps: Step[] = [];
  const completed = opts.completed ?? [];
  const clickedOnPath = new Set<string>();

  while (completed.length + steps.length < intent.actionBudget) {
    const snap = await captureSnapshot(session.page, { screenshot: false });
    const pageId = opts.pageIdFor(snap.pagePath);
    const snapshotId = repo.insertSnapshot(pageId, 'plan', snap);
    snap.id = snapshotId;

    const actionState = {
      snap,
      intent,
      completedSteps: [...completed, ...steps],
      clickedOnPath,
    };

    const a = nextAction(actionState);

    if (a.kind === 'done') {
      return { steps, status: 'done', llmCalls: opts.llm.calls };
    }

    if (a.kind === 'stuck') {
      // Check if the previous action triggered an in-flight navigation
      await session.page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
      const curPath = new URL(session.page.url()).pathname;
      if (new RegExp(intent.planner.doneWhen.pathPattern).test(curPath)) {
        return { steps, status: 'done', llmCalls: opts.llm.calls };
      }
      return { steps, status: 'stuck', llmCalls: opts.llm.calls };
    }

    if (a.kind === 'ambiguous') {
      const candidates: Candidate[] = a.candidates.map(c => ({
        ref: c.ref,
        snapshotId,
        score: 1.0,
        role: c.role,
        name: c.name,
      }));
      return { steps, status: 'ambiguous', ambiguity: candidates, llmCalls: opts.llm.calls };
    }

    // a.kind === 'act'
    const el = snap.elements.find(e => e.ref === a.ref);
    if (!el) {
      return { steps, status: 'stuck', llmCalls: opts.llm.calls };
    }

    const target = elementToTarget(el, snapshotId);
    const stepId = `s${completed.length + steps.length + 1}`;
    const provenance: Provenance = opts.repair ? 'repair-replan' : 'planner';

    const step: Step = {
      stepId,
      action: a.action,
      pagePath: snap.pagePath,
      target,
      dataKey: a.dataKey ?? null,
      provenance,
    };

    await executeStep(session.page, step, el, intent, snap);

    if (a.action === 'click') {
      clickedOnPath.add(`${snap.pagePath}|${norm(el.name)}|${el.nearText}`);
    }

    steps.push(step);

    // After each action: if session.network has status >= 500 on path ^/api/ → return status 'app_error'
    if (session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500)) {
      return { steps, status: 'app_error', llmCalls: opts.llm.calls };
    }
  }

  // Budget exhausted
  return { steps, status: 'budget', llmCalls: opts.llm.calls };
}
