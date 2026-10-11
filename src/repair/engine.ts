/**
 * Replay with detection and repair engine — PRD §11 step 6b
 */

import type { Session } from '../browser/session.js';
import type { Candidate, ElementRecord, Intent, PageSnapshot, Step } from '../types.js';
import type { Repo } from '../db/repo.js';
import type { LlmClient } from '../llm/client.js';
import { NullClient } from '../llm/client.js';
import { type Policy, loadPolicy } from '../governance/policy.js';
import { captureSnapshot } from '../snapshot/capture.js';
import { diffSnapshots } from '../diff/differ.js';
import { findReplacement, resolveBySelector } from '../match/matcher.js';
import { elementToTarget } from '../match/score.js';
import { executeStep } from '../executor/executor.js';
import { buildChangeReport } from '../diff/report.js';
import { explainChange, explainReplan, explainAmbiguous } from '../explain/templates.js';
import { planAndExecute } from '../planner/plan.js';
import { attemptAiRecovery } from './ai-fallback.js';
import { telemetry } from './telemetry.js';

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
      telemetry.addTrace({
        stepId: step.stepId,
        originalSelector: step.target.selector,
        originalAction: step.action,
        selectorFailed: false,
        semanticCandidatesFound: 0,
        contextAnchored: true,
        rankedCandidates: [],
        deterministicOutcome: 'original_pass',
        aiInvoked: false,
        actionExecuted: step.action,
        finalStatus: 'pass',
        traceLog: [
          `Original selector '${step.target.selector}' located target element directly`,
          `Action '${step.action}' executed successfully`,
        ],
      });

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
      telemetry.recordRun({
        originalSelectorFailures: 1,
        deterministicRecoveryAttempts: 1,
      });

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

        telemetry.recordRun({ deterministicRecoveries: 1 });
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
          intent.expected.map(o => o.id),
          intent
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

        telemetry.addTrace({
          stepId: step.stepId,
          originalSelector: step.target.selector,
          originalAction: step.action,
          selectorFailed: true,
          semanticCandidatesFound: m.candidates.length,
          contextAnchored: !!step.target.nearText,
          rankedCandidates: m.candidates.map(c => ({ ref: c.ref, name: c.name, score: c.score })),
          deterministicOutcome: 'single',
          aiInvoked: false,
          actionExecuted: newStep.action,
          finalStatus: 'healed_deterministic',
          traceLog: [
            `Original selector '${step.target.selector}' failed`,
            `Semantic matching searched for candidates: found ${m.candidates.length} candidate(s)`,
            `Context-aware matching evaluated surrounding context (nearText="${step.target.nearText || 'none'}")`,
            `Confidence scoring ranked top candidate '${m.best?.name}' (score: ${m.best?.score.toFixed(3)} >= threshold ${policy.match.strong})`,
            `Deterministic recovery accepted candidate '${m.best?.name}' without AI`,
            `Recovered action executed`,
          ],
        });

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
        let aiResolved = false;
        let aiInvoked = false;
        let aiReason: string | undefined;
        let aiProposal: string | null = null;
        let aiValidated = false;

        if (ctx.llmMode && ctx.llmMode !== 'off' && !(ctx.llm instanceof NullClient)) {
          aiInvoked = true;
          telemetry.recordRun({ aiFallbackInvocations: 1 });
          const aiRes = await attemptAiRecovery(
            {
              step,
              target: step.target,
              snap,
              candidatesExamined: m.candidates,
              deterministicReason: `Ambiguous: multiple candidates scored within margin: ${m.candidates.map(c => `${c.name} (${c.score.toFixed(3)})`).join(', ')}`,
              intent,
            },
            ctx.llm,
            ctx.llmMode
          );

          aiReason = aiRes.reason;
          aiProposal = aiRes.candidate?.name ?? null;

          if (aiRes.kind === 'recovered' && aiRes.candidate) {
            aiValidated = true;
            aiResolved = true;
            telemetry.recordRun({ aiAssistedRecoveries: 1 });
            repaired = true;
            const replacementEl = aiRes.candidate;
            const newTarget = elementToTarget(replacementEl, snap.id);
            const newStep: Step = {
              ...step,
              target: newTarget,
              provenance: 'llm',
            };
            const explanation = `Recovered via AI fallback: ${aiRes.reason} (selected ${replacementEl.name} over competing candidates)`;
            const report = buildChangeReport({
              base: base.id ?? step.target.snapshotId,
              head: snap.id,
              items,
              affectedSteps: [step.stepId],
              classification: 'HARMLESS_UI',
              confidence: aiRes.confidence,
              explanation,
            });
            const changeId = repo.insertChange(report);
            changeIds.push(changeId);

            telemetry.addTrace({
              stepId: step.stepId,
              originalSelector: step.target.selector,
              originalAction: step.action,
              selectorFailed: true,
              semanticCandidatesFound: m.candidates.length,
              contextAnchored: !!step.target.nearText,
              rankedCandidates: m.candidates.map(c => ({ ref: c.ref, name: c.name, score: c.score })),
              deterministicOutcome: 'ambiguous',
              aiInvoked: true,
              aiReason: aiRes.reason,
              aiProposal: replacementEl.name,
              aiValidated: true,
              actionExecuted: newStep.action,
              finalStatus: 'healed_ai',
              traceLog: [
                `Original selector '${step.target.selector}' failed`,
                `Semantic matching found ${m.candidates.length} candidates`,
                `Context-aware matching could not distinguish candidates`,
                `Confidence scoring ranked multiple candidates within margin ${policy.match.margin}`,
                `Deterministic recovery rejected candidates as ambiguous`,
                `AI fallback invoked for disambiguation`,
                `AI recommendation validated: selected '${replacementEl.name}' (ref: ${replacementEl.ref})`,
                `Recovered action executed`,
              ],
            });

            await executeStep(session.page, newStep, replacementEl, intent, snap);
            newSteps.push(newStep);

            if (session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500)) {
              appError = true;
              plannerStatus = 'app_error';
              break;
            }
            continue;
          } else {
            telemetry.recordRun({ aiFallbackFailures: 1 });
          }
        }

        if (!aiResolved) {
          telemetry.recordRun({ unresolvedAmbiguousCases: 1 });
          const explanation = explainAmbiguous(step.stepId, m.candidates, intent);
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

          telemetry.addTrace({
            stepId: step.stepId,
            originalSelector: step.target.selector,
            originalAction: step.action,
            selectorFailed: true,
            semanticCandidatesFound: m.candidates.length,
            contextAnchored: !!step.target.nearText,
            rankedCandidates: m.candidates.map(c => ({ ref: c.ref, name: c.name, score: c.score })),
            deterministicOutcome: 'ambiguous',
            aiInvoked,
            aiReason,
            aiProposal,
            aiValidated,
            finalStatus: 'unresolved_ambiguous',
            traceLog: [
              `Original selector '${step.target.selector}' failed`,
              `Semantic matching found candidates: ${m.candidates.map(c => `'${c.name}'`).join(', ')}`,
              `Context-aware matching could not distinguish candidates`,
              `Confidence scoring confirmed multiple plausible candidates within margin`,
              ...(aiInvoked
                ? [
                    `AI fallback invoked`,
                    `AI fallback could not resolve ambiguity safely: ${aiReason || 'Ambiguity confirmed'}`,
                  ]
                : [`AI fallback not invoked (deterministic ambiguity guarded)`]),
              `Recovery aborted safely: Unresolved: Ambiguous Choices (no action executed to avoid false clicks)`,
            ],
          });

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
      }

      if (m.kind === 'none') {
        let aiResolved = false;
        let aiInvoked = false;
        let aiReason: string | undefined;
        let aiProposal: string | null = null;
        let aiValidated = false;

        if (ctx.llmMode && ctx.llmMode !== 'off' && !(ctx.llm instanceof NullClient)) {
          aiInvoked = true;
          telemetry.recordRun({ aiFallbackInvocations: 1 });
          const aiRes = await attemptAiRecovery(
            {
              step,
              target: step.target,
              snap,
              candidatesExamined: m.candidates,
              deterministicReason: `No candidate met strong threshold (${policy.match.strong}): best score was ${m.candidates[0]?.score?.toFixed(3) ?? '0.000'}`,
              intent,
            },
            ctx.llm,
            ctx.llmMode
          );

          aiReason = aiRes.reason;
          aiProposal = aiRes.candidate?.name ?? null;

          if (aiRes.kind === 'recovered' && aiRes.candidate) {
            aiValidated = true;
            aiResolved = true;
            telemetry.recordRun({ aiAssistedRecoveries: 1 });
            repaired = true;
            const replacementEl = aiRes.candidate;
            const newTarget = elementToTarget(replacementEl, snap.id);
            const newStep: Step = {
              ...step,
              target: newTarget,
              provenance: 'llm',
            };
            const explanation = `Recovered via AI fallback: ${aiRes.reason} (selected ${replacementEl.name})`;
            const report = buildChangeReport({
              base: base.id ?? step.target.snapshotId,
              head: snap.id,
              items,
              affectedSteps: [step.stepId],
              classification: 'HARMLESS_UI',
              confidence: aiRes.confidence,
              explanation,
            });
            const changeId = repo.insertChange(report);
            changeIds.push(changeId);

            telemetry.addTrace({
              stepId: step.stepId,
              originalSelector: step.target.selector,
              originalAction: step.action,
              selectorFailed: true,
              semanticCandidatesFound: m.candidates.length,
              contextAnchored: !!step.target.nearText,
              rankedCandidates: m.candidates.map(c => ({ ref: c.ref, name: c.name, score: c.score })),
              deterministicOutcome: 'none',
              aiInvoked: true,
              aiReason: aiRes.reason,
              aiProposal: replacementEl.name,
              aiValidated: true,
              actionExecuted: newStep.action,
              finalStatus: 'healed_ai',
              traceLog: [
                `Original selector '${step.target.selector}' failed`,
                `Semantic matching searched for candidates: none met threshold ${policy.match.strong}`,
                `Context-aware matching did not find strong anchor`,
                `Deterministic recovery rejected candidates as insufficiently reliable`,
                `AI fallback invoked`,
                `AI recommendation validated: selected '${replacementEl.name}' (ref: ${replacementEl.ref})`,
                `Recovered action executed`,
              ],
            });

            await executeStep(session.page, newStep, replacementEl, intent, snap);
            newSteps.push(newStep);

            if (session.network.some(n => /^\/api\//.test(n.path) && n.status >= 500)) {
              appError = true;
              plannerStatus = 'app_error';
              break;
            }
            continue;
          } else {
            telemetry.recordRun({ aiFallbackFailures: 1 });
          }
        }

        // If AI could not resolve or was off, attempt flow replanning
        items.unshift({
          kind: 'FLOW_CHANGED',
          before: { name: step.target.name, pagePath: step.pagePath },
          after: { pagePath: snap.pagePath },
          evidence: `'${step.target.name}' not found on ${snap.pagePath}`,
        });

        const remainingStepIds = plan.slice(i).map(s => s.stepId);
        repaired = true;
        replanned = true;

        const explanation = explainReplan(
          {
            stepId: step.stepId,
            oldName: step.target.name,
            oldPath: step.pagePath,
            curPath: snap.pagePath,
            best: m.candidates[0]?.score ?? 0,
            strong: policy.match.strong,
            from: step.stepId,
            to: plan[plan.length - 1].stepId,
          },
          intent
        );

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

        telemetry.addTrace({
          stepId: step.stepId,
          originalSelector: step.target.selector,
          originalAction: step.action,
          selectorFailed: true,
          semanticCandidatesFound: m.candidates.length,
          contextAnchored: !!step.target.nearText,
          rankedCandidates: m.candidates.map(c => ({ ref: c.ref, name: c.name, score: c.score })),
          deterministicOutcome: 'none',
          aiInvoked,
          aiReason,
          aiProposal,
          aiValidated,
          finalStatus: 'replan_flow',
          traceLog: [
            `Original selector '${step.target.selector}' failed`,
            `Semantic matching found no acceptable candidates`,
            `Deterministic recovery rejected candidates`,
            ...(aiInvoked ? [`AI fallback invoked and could not recover: ${aiReason || 'stuck'}`] : []),
            `Triggered multi-step flow replan`,
          ],
        });

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
