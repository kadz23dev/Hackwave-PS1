/**
 * Explanation templates (no LLM) — PRD §10.7
 */

export interface StepExplainInput {
  stepId: string;
  action: string;
  target: {
    name: string;
    selector: string;
  };
}

export interface MatchExplainInput {
  best: {
    role: string;
    name: string;
    ref: string;
    score: number;
  } | null;
}

/**
 * explainChange — PRD §10.7
 * "Step {stepId} ({action} '{oldName}' via {oldSelector}) no longer matches: {item.evidence}.
 *  Goal '{goal}' is still reachable via {newRole} '{newName}' ({ref}), score {score:.2f}.
 *  Outcome verified by {oracleIds.join(', ')}."
 */
export function explainChange(
  step: StepExplainInput,
  item: { evidence: string },
  match: MatchExplainInput | null,
  goal: string,
  oracleIds: string[],
): string {
  const stepId = step.stepId;
  const action = step.action;
  const oldName = step.target.name;
  const oldSelector = step.target.selector;
  const evidence = item.evidence;
  const newRole = match?.best?.role ?? 'element';
  const newName = match?.best?.name ?? 'unknown';
  const ref = match?.best?.ref ?? 'none';
  const score = (match?.best?.score ?? 0).toFixed(2);
  const oracleList = oracleIds.join(', ');

  return `Step ${stepId} (${action} '${oldName}' via ${oldSelector}) no longer matches: ${evidence}. Goal '${goal}' is still reachable via ${newRole} '${newName}' (${ref}), score ${score}. Outcome verified by ${oracleList}.`;
}

export function explainReplan(opts: {
  stepId: string;
  oldName: string;
  oldPath: string;
  curPath: string;
  best: number;
  strong: number;
  from: string | number;
  to: string | number;
}): string {
  return `Step ${opts.stepId} expected '${opts.oldName}' on ${opts.oldPath}, but no matching element exists on ${opts.curPath} (best score ${opts.best.toFixed(2)} < ${opts.strong.toFixed(2)}). The flow changed; steps ${opts.from}–${opts.to} were rebuilt from the intent.`;
}

export function explainAppBug(
  failedOracleDetail: string,
  serverErrorSummary = '',
): string {
  const errSummary = serverErrorSummary ? ` ${serverErrorSummary}.` : '';
  return `The workflow completed in the UI, but the expected outcome did not happen: ${failedOracleDetail}.${errSummary} This is an application failure, not a UI change. The repair was rejected.`;
}

export function explainAmbiguous(
  stepId: string,
  candidates: Array<{ name: string; score: number }>,
): string {
  const n = candidates.length;
  const c1 = candidates[0];
  const c2 = candidates[1];
  const c1Desc = c1 ? `${c1.name} (${c1.score.toFixed(2)})` : '';
  const c2Desc = c2 ? `${c2.name} (${c2.score.toFixed(2)})` : '';
  return `Step ${stepId} has ${n} equally plausible replacements: ${c1Desc}, ${c2Desc}. HealTest will not guess. A human must choose in the dashboard.`;
}
