import type { Classification, OracleResult, Verdict } from '../types.js';

export interface VerdictInput {
  toolError: boolean;
  appError: boolean;
  oracleResults: OracleResult[];
  plannerStatus: 'done' | 'stuck' | 'ambiguous' | 'budget' | 'app_error' | 'replayed';
  guardViolation: boolean;
  repaired: boolean;
  replanned: boolean;
  ambiguous: boolean;
  reusedRepair: boolean;
  planIsKnownGood: boolean;
}

export interface VerdictDecision {
  verdict: Verdict;
  classification: Classification | null;
  exitCode: 0 | 1 | 10 | 11 | 12;
}
import { allRequiredPass } from '../oracle/runner.js';
export { allRequiredPass };

/**
 * Map verdict to standard CLI exit code — PRD §10.5
 */
export function exitCodeFor(v: Verdict): 0 | 1 | 10 | 11 | 12 {
  switch (v) {
    case 'PASS':
    case 'HEALED_PASS':
      return 0;
    case 'APP_BUG':
      return 10;
    case 'NEEDS_REVIEW':
      return 11;
    case 'FAIL_UNREPAIRABLE':
      return 12;
  }
}

/**
 * decideVerdict(input) — PRD §10.5
 * Evaluates rows 1–6 in exact order; first matching row wins.
 * Strictly no LLM involved (G5).
 */
export function decideVerdict(i: VerdictInput): VerdictDecision {
  // Row 1: toolError (crash, bad intent, origin not allowed)
  if (i.toolError) {
    return {
      verdict: 'FAIL_UNREPAIRABLE',
      classification: null,
      exitCode: 1,
    };
  }

  // Row 2: appError (any 5xx on ^/api/) OR any non-supportingOnly oracle ok=false
  if (
    i.appError ||
    i.plannerStatus === 'app_error' ||
    i.oracleResults.some(r => !r.supportingOnly && !r.ok)
  ) {
    return {
      verdict: 'APP_BUG',
      classification: 'APP_BUG',
      exitCode: 10,
    };
  }

  // Row 3: ambiguous
  if (i.ambiguous || i.plannerStatus === 'ambiguous') {
    return {
      verdict: 'NEEDS_REVIEW',
      classification: 'AMBIGUOUS',
      exitCode: 11,
    };
  }

  // Row 4: plannerStatus in stuck/budget, or guard violation
  if (
    i.plannerStatus === 'stuck' ||
    i.plannerStatus === 'budget' ||
    i.guardViolation
  ) {
    return {
      verdict: 'FAIL_UNREPAIRABLE',
      classification: i.repaired ? 'BREAKING_UI' : null,
      exitCode: 12,
    };
  }

  // Row 5: all required oracles ok AND (repaired OR (reusedRepair AND NOT planIsKnownGood))
  if (
    allRequiredPass(i.oracleResults) &&
    (i.repaired || (i.reusedRepair && !i.planIsKnownGood))
  ) {
    return {
      verdict: 'HEALED_PASS',
      classification: i.replanned ? 'BREAKING_UI' : 'HARMLESS_UI',
      exitCode: 0,
    };
  }

  // Row 6: all required oracles ok
  if (allRequiredPass(i.oracleResults)) {
    return {
      verdict: 'PASS',
      classification: null,
      exitCode: 0,
    };
  }

  // Safe default: if required oracles did not pass and nothing else matched, it is an application bug
  return {
    verdict: 'APP_BUG',
    classification: 'APP_BUG',
    exitCode: 10,
  };
}
