import type { Candidate, ChangeItem, Step } from '../types.js';

export interface StepExplainInput {
  stepId: string;
  action: string;
  target?: {
    name?: string;
    selector?: string;
  };
  name?: string;
  selector?: string;
}

export interface CandidateExplainInput {
  role: string;
  name: string;
  ref: string;
  score: number;
}

/**
 * PRD §10.7:
 * "Step {stepId} ({action} '{oldName}' via {oldSelector}) no longer matches: {item.evidence}.
 *  Goal '{goal}' is still reachable via {newRole} '{newName}' ({ref}), score {score:.2f}.
 *  Outcome verified by {oracleIds.join(', ')}."
 */
export function explainChange(
  step: Step | StepExplainInput,
  item: ChangeItem | { evidence: string },
  match: Candidate | CandidateExplainInput,
  goal: string,
  oracleIds: string[]
): string {
  const oldName = step.target?.name ?? ('name' in step ? (step as StepExplainInput).name : '') ?? '';
  const oldSelector = step.target?.selector ?? ('selector' in step ? (step as StepExplainInput).selector : '') ?? '';
  const newRole = match.role;
  const newName = match.name;
  const ref = match.ref;
  const score = match.score.toFixed(2);
  const oracleList = oracleIds.join(', ');

  return `Step ${step.stepId} (${step.action} '${oldName}' via ${oldSelector}) no longer matches: ${item.evidence}. Goal '${goal}' is still reachable via ${newRole} '${newName}' (${ref}), score ${score}. Outcome verified by ${oracleList}.`;
}

export function explainReplan(
  stepId: string,
  oldName: string,
  oldPath: string,
  curPath: string,
  best: number,
  strong: number,
  from: string,
  to: string
): string {
  return `Step ${stepId} expected '${oldName}' on ${oldPath}, but no matching element exists on ${curPath} (best score ${best.toFixed(2)} < ${strong}). The flow changed; steps ${from}–${to} were rebuilt from the intent.`;
}

export function explainAppBug(
  failedOracleDetail: string,
  serverErrorSummary?: string
): string {
  const summaryPart = serverErrorSummary ? ` ${serverErrorSummary}.` : '';
  return `The workflow completed in the UI, but the expected outcome did not happen: ${failedOracleDetail}.${summaryPart} This is an application failure, not a UI change. The repair was rejected.`;
}

export function explainAmbiguous(
  stepId: string,
  candidates: Array<{ name: string; score: number }>
): string {
  const list = candidates.map(c => `${c.name} (${c.score.toFixed(2)})`).join(', ');
  return `Step ${stepId} has ${candidates.length} equally plausible replacements: ${list}. HealTest will not guess. A human must choose in the dashboard.`;
}
