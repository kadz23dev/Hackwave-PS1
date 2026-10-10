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

import { LlmPlanner } from './llm.js';
import { NullClient } from '../llm/client.js';

export async function planAndExecute(
  session: Session,
  intent: Intent,
  repo: Repo,
  opts: {
    repair: boolean;
    completed: Step[];
    llm: LlmClient;
    pageIdFor(path: string): number;
    llmMode?: string;
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
    let fromLlm = false;
    let actToExecute: { action: 'click' | 'fill' | 'check' | 'select'; ref: string; dataKey: string | null } | null = null;

    if (a.kind === 'done') {
      return { steps, status: 'done', llmCalls: opts.llm.calls };
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

    if (a.kind === 'stuck') {
      // Check if the previous action triggered an in-flight navigation
      await session.page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
      const curPath = new URL(session.page.url()).pathname;
      if (new RegExp(intent.planner.doneWhen.pathPattern).test(curPath)) {
        return { steps, status: 'done', llmCalls: opts.llm.calls };
      }

      const mode = opts.llmMode ?? (opts.llm instanceof NullClient ? 'off' : 'on');
      if (mode !== 'off') {
        const llmResult = await LlmPlanner.nextAction(
          { snap, intent, completedSteps: [...completed, ...steps] },
          opts.llm
        );
        if (llmResult.kind === 'done') {
          return { steps, status: 'done', llmCalls: opts.llm.calls };
        }
        if (llmResult.kind === 'act') {
          actToExecute = { action: llmResult.action, ref: llmResult.ref, dataKey: llmResult.dataKey };
          fromLlm = true;
        } else {
          return { steps, status: 'stuck', llmCalls: opts.llm.calls };
        }
      } else {
        return { steps, status: 'stuck', llmCalls: opts.llm.calls };
      }
    } else {
      // a.kind === 'act'
      actToExecute = { action: a.action, ref: a.ref, dataKey: a.dataKey };
    }

    if (!actToExecute) {
      return { steps, status: 'stuck', llmCalls: opts.llm.calls };
    }

    const el = snap.elements.find(e => e.ref === actToExecute!.ref);
    if (!el) {
      return { steps, status: 'stuck', llmCalls: opts.llm.calls };
    }

    const target = elementToTarget(el, snapshotId);
    const stepId = `s${completed.length + steps.length + 1}`;
    const provenance: Provenance = fromLlm ? 'llm' : (opts.repair ? 'repair-replan' : 'planner');

    const step: Step = {
      stepId,
      action: actToExecute.action,
      pagePath: snap.pagePath,
      target,
      dataKey: actToExecute.dataKey ?? null,
      provenance,
    };

    await executeStep(session.page, step, el, intent, snap);

    if (actToExecute.action === 'click') {
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
