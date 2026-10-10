/**
 * Replay with detection and repair engine — PRD §11 step 6b
 */

import type { Session } from '../browser/session.js';
import type { Candidate, ElementRecord, Intent, PageSnapshot, Step } from '../types.js';
import type { Repo } from '../db/repo.js';
import type { LlmClient } from '../llm/client.js';
import { type Policy, loadPolicy } from '../governance/policy.js';
import { captureSnapshot } from '../snapshot/capture.js';
import { diffSnapshots } from '../diff/differ.js';
import { findReplacement, resolveBySelector } from '../match/matcher.js';
import { elementToTarget } from '../match/score.js';
import { executeStep } from '../executor/executor.js';
import { buildChangeReport } from '../diff/report.js';
import { explainChange, explainReplan, explainAmbiguous } from '../explain/templates.js';
import { planAndExecute } from '../planner/plan.js';

export async function replayWithRepair(
  session: Session,
  intent: Intent,
  plan: Step[],
  repo: Repo,
  ctx: {
    policy?: Policy;
    pageIdFor: (path: string) => number;
    llm: LlmClient;
    llmMode?: string;
  }
): Promise<{
  newSteps: Step[];
  changeIds: number[];
  repaired: boolean;
  replanned: boolean;
  ambiguity: { stepId: string; candidates: Candidate[] } | null;
  appError: boolean;
  plannerStatus: 'done' | 'stuck' | 'ambiguous' | 'budget' | 'app_error' | 'replayed';
  llmCalls: number;
}> {
  const policy = ctx.policy ?? loadPolicy();
  const newSteps: Step[] = [];
  const changeIds: number[] = [];
  let repaired = false;
  let replanned = false;
  let ambiguity: { stepId: string; candidates: Candidate[] } | null = null;
  let appError = false;
  let plannerStatus: 'done' | 'stuck' | 'ambiguous' | 'budget' | 'app_error' | 'replayed' = 'replayed';

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const snap = await captureSnapshot(session.page, { screenshot: true });
    const pageId = ctx.pageIdFor(snap.pagePath);
    const snapId = repo.insertSnapshot(pageId, 'replay', snap);
    snap.id = snapId;

    const el = await resolveBySelector(session.page, snap, step.target, policy);
    if (el) {
      await executeStep(session.page, step, el, intent, snap);
      newSteps.push({
        ...step,
        provenance: 'replay',
        target: elementToTarget(el, snap.id),
      });

      if (session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500)) {
        appError = true;
        plannerStatus = 'app_error';
        break;
      }
    } else {
      // DETECT
      const baseRow = repo.getSnapshot(step.target.snapshotId);
      const base: PageSnapshot = {
        id: baseRow?.id ?? step.target.snapshotId,
        pagePath: baseRow?.pagePath ?? step.pagePath,
        url: '',
        title: '',
        headings: [],
        elements: (baseRow?.elements as ElementRecord[]) ?? [],
        ariaYaml: baseRow?.ariaYaml ?? '',
        contentHash: baseRow?.contentHash ?? '',
        screenshotPath: baseRow?.screenshotPath ?? null,
      };

      const items = diffSnapshots(base, snap);
      const m = findReplacement(step.target, snap, policy);

      if (m.kind === 'single') {
        const replacementEl = snap.elements.find(e => e.ref === m.best!.ref);
        if (!replacementEl) {
          plannerStatus = 'stuck';
          break;
        }

        repaired = true;
        const newTarget = elementToTarget(replacementEl, snap.id);
        const newStep: Step = {
          ...step,
          target: newTarget,
          provenance: 'repair-match',
        };

        const explanation = explainChange(
          step,
          items[0] ?? { evidence: `'${step.target.name}' not found` },
          { best: m.best },
          intent.goal,
          intent.expected.map(o => o.id)
        );

        const report = buildChangeReport({
          base: base.id ?? step.target.snapshotId,
          head: snap.id,
          items,
          affectedSteps: [step.stepId],
          classification: 'HARMLESS_UI',
          confidence: m.best?.score ?? 1.0,
          explanation,
        });

        const changeId = repo.insertChange(report);
        changeIds.push(changeId);

        await executeStep(session.page, newStep, replacementEl, intent, snap);
        newSteps.push(newStep);

        if (session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500)) {
          appError = true;
          plannerStatus = 'app_error';
          break;
        }

        continue;
      }

      if (m.kind === 'ambiguous') {
        const explanation = explainAmbiguous(step.stepId, m.candidates);
        const report = buildChangeReport({
          base: base.id ?? step.target.snapshotId,
          head: snap.id,
          items,
          affectedSteps: [step.stepId],
          classification: 'AMBIGUOUS',
          confidence: 0.5,
          explanation,
        });
        const changeId = repo.insertChange(report);
        changeIds.push(changeId);

        ambiguity = { stepId: step.stepId, candidates: m.candidates };
        plannerStatus = 'ambiguous';
        // DO NOT click or fill anything
        return {
          newSteps,
          changeIds,
          repaired,
          replanned,
          ambiguity,
          appError,
          plannerStatus,
          llmCalls: ctx.llm.calls,
        };
      }

      if (m.kind === 'none') {
        items.unshift({
          kind: 'FLOW_CHANGED',
          before: { name: step.target.name, pagePath: step.pagePath },
          after: { pagePath: snap.pagePath },
          evidence: `'${step.target.name}' not found on ${snap.pagePath}`,
        });

        const remainingStepIds = plan.slice(i).map(s => s.stepId);
        repaired = true;
        replanned = true;

        const explanation = explainReplan({
          stepId: step.stepId,
          oldName: step.target.name,
          oldPath: step.pagePath,
          curPath: snap.pagePath,
          best: m.candidates[0]?.score ?? 0,
          strong: policy.match.strong,
          from: step.stepId,
          to: plan[plan.length - 1].stepId,
        });

        const report = buildChangeReport({
          base: base.id ?? step.target.snapshotId,
          head: snap.id,
          items,
          affectedSteps: remainingStepIds,
          classification: 'BREAKING_UI',
          confidence: m.candidates[0]?.score ?? 0,
          explanation,
        });

        const changeId = repo.insertChange(report);
        changeIds.push(changeId);

        const r = await planAndExecute(session, intent, repo, {
          repair: true,
          completed: newSteps,
          llm: ctx.llm,
          pageIdFor: ctx.pageIdFor,
          llmMode: ctx.llmMode,
        });

        newSteps.push(...r.steps);
        plannerStatus = r.status;
        if (r.status === 'ambiguous' && r.ambiguity) {
          ambiguity = { stepId: `s${newSteps.length + 1}`, candidates: r.ambiguity };
        }
        if (r.status === 'app_error') {
          appError = true;
        }
        break;
      }
    }
  }

  return {
    newSteps,
    changeIds,
    repaired,
    replanned,
    ambiguity,
    appError,
    plannerStatus,
    llmCalls: ctx.llm.calls,
  };
}
