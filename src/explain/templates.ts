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

export interface IntentWithData {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OracleSummaryItem {
  oracleId?: string;
  id?: string;
  name?: string;
  ok: boolean;
  reason?: string;
  error?: string;
  supportingOnly?: boolean;
  detail?: Record<string, unknown>;
}

export interface VerdictOutcomeInput {
  verdict: string;
  oracleResults?: OracleSummaryItem[];
  failureDetail?: string;
  serverErrorSummary?: string;
}

export interface ChangeExplainItem {
  id?: number | string;
  changeId?: number | string;
  explanation?: string;
}

export interface RepairExplainInput {
  id?: number;
  repairId?: number;
  status?: string;
  proposer?: string;
  explanation?: string;
}

/**
 * maskSecrets — replaces sensitive intent data with masked equivalents
 * - Key matching /card|cvc|expiry/i
 * - cardNumber: '****' + last 4 digits
 * - cvc/expiry: '***'
 */
export function maskSecrets(
  s: string,
  intent?: IntentWithData | null
): string {
  if (!s) return s;
  let masked = s;
  if (intent?.data) {
    for (const [key, val] of Object.entries(intent.data)) {
      if (/card|cvc|expiry/i.test(key) && val !== undefined && val !== null) {
        const strVal = String(val);
        if (strVal.length > 0) {
          const replacement = /card/i.test(key)
            ? '****' + (strVal.length >= 4 ? strVal.slice(-4) : strVal)
            : '***';
          masked = masked.replaceAll(strVal, replacement);
        }
      }
    }
  }
  // Defense-in-depth: mask any 13-19 digit card numbers found in the string
  masked = masked.replace(/\b\d{13,19}\b/g, m => '****' + m.slice(-4));
  return masked;
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
  intent?: IntentWithData | null
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

  const text = `Step ${stepId} (${action} '${oldName}' via ${oldSelector}) no longer matches: ${evidence}. Goal '${goal}' is still reachable via ${newRole} '${newName}' (${ref}), score ${score}. Outcome verified by ${oracleList}.`;
  return maskSecrets(text, intent);
}

/**
 * explainReplan — PRD §10.7
 * "Step {stepId} expected '{oldName}' on {oldPath}, but no matching element exists on {curPath}
 *  (best score {best:.2f} < {strong}). The flow changed; steps {from}–{to} were rebuilt from the intent."
 */
export function explainReplan(
  opts: {
    stepId: string;
    oldName: string;
    oldPath: string;
    curPath: string;
    best: number;
    strong: number;
    from: string | number;
    to: string | number;
  },
  intent?: IntentWithData | null
): string {
  const text = `Step ${opts.stepId} expected '${opts.oldName}' on ${opts.oldPath}, but no matching element exists on ${opts.curPath} (best score ${opts.best.toFixed(2)} < ${opts.strong.toFixed(2)}). The flow changed; steps ${opts.from}–${opts.to} were rebuilt from the intent.`;
  return maskSecrets(text, intent);
}

/**
 * explainAppBug — PRD §10.7
 * "The workflow completed in the UI, but the expected outcome did not happen: {failed oracle detail}.
 *  {5xx summary}. This is an application failure, not a UI change. The repair was rejected."
 */
export function explainAppBug(
  failedOracleDetail: string,
  serverErrorSummary = '',
  intent?: IntentWithData | null
): string {
  const errSummary = serverErrorSummary
    ? ` ${serverErrorSummary.replace(/\.+$/, '')}.`
    : '';
  const cleanDetail = failedOracleDetail.replace(/\.+$/, '');
  const text = `The workflow completed in the UI, but the expected outcome did not happen: ${cleanDetail}.${errSummary} This is an application failure, not a UI change. The repair was rejected.`;
  return maskSecrets(text, intent);
}

/**
 * explainAmbiguous — PRD §10.7
 * "Step {stepId} has {n} equally plausible replacements: {name1} ({s1:.2f}), {name2} ({s2:.2f}).
 *  HealTest will not guess. A human must choose in the dashboard."
 */
export function explainAmbiguous(
  stepId: string,
  candidates: Array<{ name: string; score: number }>,
  intent?: IntentWithData | null
): string {
  const n = candidates.length;
  const list = candidates
    .map(c => `${c.name} (${c.score.toFixed(2)})`)
    .join(', ');
  const text = `Step ${stepId} has ${n} equally plausible replacements: ${list}. HealTest will not guess. A human must choose in the dashboard.`;
  return maskSecrets(text, intent);
}

/**
 * explainVerdict — PRD §10.7
 * Joins: one sentence for the verdict + each change explanation (max 3)
 * + oracle summary "order-created ✓, no-server-errors ✕ (POST /api/orders 500)"
 */
export function explainVerdict(
  outcome: VerdictOutcomeInput | string,
  changes?: Array<ChangeExplainItem | string | null | undefined> | ChangeExplainItem | string | null,
  repair?: RepairExplainInput | null,
  intent?: IntentWithData | null
): string {
  const verdict = typeof outcome === 'string' ? outcome : outcome?.verdict ?? 'PASS';
  const oracles: OracleSummaryItem[] =
    typeof outcome === 'object' && outcome?.oracleResults
      ? outcome.oracleResults
      : [];

  // 1. One sentence for the verdict
  let verdictSentence = '';
  switch (verdict) {
    case 'HEALED_PASS':
      verdictSentence = 'Workflow healed and passed validation.';
      break;
    case 'PASS':
      verdictSentence = 'Workflow completed successfully and all required oracles passed.';
      break;
    case 'APP_BUG': {
      let failedDetail = typeof outcome === 'object' ? outcome?.failureDetail : undefined;
      if (!failedDetail) {
        const failed = oracles.find(o => !o.ok && !o.supportingOnly) ?? oracles.find(o => !o.ok);
        failedDetail = failed ? `${failed.oracleId ?? failed.id ?? failed.name} check failed` : 'expected backend state was not achieved';
      }
      let serverSummary = typeof outcome === 'object' ? outcome?.serverErrorSummary : undefined;
      if (!serverSummary) {
        const errOracle = oracles.find(o => !o.ok && (o.reason || o.detail?.reason));
        serverSummary = errOracle?.reason ?? (typeof errOracle?.detail?.reason === 'string' ? errOracle.detail.reason : '') ?? '';
      }
      verdictSentence = explainAppBug(failedDetail, serverSummary, intent);
      break;
    }
    case 'NEEDS_REVIEW':
      verdictSentence = 'Run requires review due to ambiguous UI match.';
      break;
    case 'FAIL_UNREPAIRABLE':
      verdictSentence = 'Workflow failed and could not be repaired.';
      break;
    default:
      verdictSentence = `Run finished with verdict ${verdict}.`;
      break;
  }

  // 2. Each change explanation (max 3)
  const changeList: Array<ChangeExplainItem | string | null | undefined> = Array.isArray(changes)
    ? changes
    : changes
    ? [changes]
    : [];

  const changeLines: string[] = [];
  for (let i = 0; i < Math.min(changeList.length, 3); i++) {
    const c = changeList[i];
    if (!c) continue;
    if (typeof c === 'string') {
      changeLines.push(c);
    } else {
      const id = c.id ?? c.changeId;
      const exp = c.explanation ?? '';
      if (id !== undefined && !exp.startsWith(`Change #${id}`) && !exp.startsWith('Change #')) {
        changeLines.push(`Change #${id}: ${exp}`);
      } else if (exp) {
        changeLines.push(exp);
      }
    }
  }

  // 3. Oracle summary: "order-created ✓, no-server-errors ✕ (POST /api/orders 500)"
  let oracleSummary = '';
  if (oracles.length > 0) {
    const items = oracles.map(o => {
      const id = o.oracleId ?? o.id ?? o.name ?? 'oracle';
      if (o.ok) {
        return `${id} ✓`;
      }
      const reason = o.reason ?? (typeof o.detail?.reason === 'string' ? o.detail.reason : '');
      const reasonStr = reason ? ` (${reason})` : '';
      return `${id} ✕${reasonStr}`;
    });
    oracleSummary = items.join(', ');
  }

  const parts: string[] = [];
  if (verdictSentence) parts.push(verdictSentence);
  for (const cl of changeLines) {
    if (cl) parts.push(cl);
  }
  if (oracleSummary) {
    parts.push(oracleSummary);
  }

  const joined = parts.join(' ');
  return maskSecrets(joined, intent);
}
