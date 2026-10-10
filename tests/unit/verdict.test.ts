import { describe, it, expect } from 'vitest';
import {
  allRequiredPass,
  decideVerdict,
  exitCodeFor,
  type VerdictInput,
} from '../../src/classify/verdict.js';
import type { OracleResult } from '../../src/types.js';

function baseInput(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    toolError: false,
    appError: false,
    oracleResults: [
      {
        oracleId: 'order-created',
        type: 'backend_state',
        ok: true,
        supportingOnly: false,
        detail: {},
      },
      {
        oracleId: 'dom-text',
        type: 'dom_state',
        ok: true,
        supportingOnly: true,
        detail: {},
      },
    ],
    plannerStatus: 'done',
    guardViolation: false,
    repaired: false,
    replanned: false,
    ambiguous: false,
    reusedRepair: false,
    planIsKnownGood: false,
    ...overrides,
  };
}

describe('Verdict Decision Table — PRD §10.5 (T09)', () => {
  // ─── Rows 1–6 tests ─────────────────────────────────────────────────────────

  it('Row 1: toolError returns FAIL_UNREPAIRABLE with exitCode 1 and null classification', () => {
    const input = baseInput({ toolError: true });
    const decision = decideVerdict(input);
    expect(decision.verdict).toBe('FAIL_UNREPAIRABLE');
    expect(decision.exitCode).toBe(1);
    expect(decision.classification).toBeNull();
  });

  it('Row 2: appError or backend oracle failure returns APP_BUG exit 10', () => {
    // Via appError
    const resAppErr = decideVerdict(baseInput({ appError: true }));
    expect(resAppErr.verdict).toBe('APP_BUG');
    expect(resAppErr.classification).toBe('APP_BUG');
    expect(resAppErr.exitCode).toBe(10);

    // Via plannerStatus 'app_error'
    const resPlanAppErr = decideVerdict(baseInput({ plannerStatus: 'app_error' }));
    expect(resPlanAppErr.verdict).toBe('APP_BUG');
    expect(resPlanAppErr.exitCode).toBe(10);

    // Via non-supporting oracle failure
    const failedOracle: OracleResult[] = [
      {
        oracleId: 'order-created',
        type: 'backend_state',
        ok: false,
        supportingOnly: false,
        detail: {},
      },
    ];
    const resOracleFail = decideVerdict(baseInput({ oracleResults: failedOracle }));
    expect(resOracleFail.verdict).toBe('APP_BUG');
    expect(resOracleFail.classification).toBe('APP_BUG');
    expect(resOracleFail.exitCode).toBe(10);
  });

  it('Row 3: ambiguous returns NEEDS_REVIEW exit 11 with AMBIGUOUS classification', () => {
    const resAmb = decideVerdict(baseInput({ ambiguous: true }));
    expect(resAmb.verdict).toBe('NEEDS_REVIEW');
    expect(resAmb.classification).toBe('AMBIGUOUS');
    expect(resAmb.exitCode).toBe(11);

    const resPlanAmb = decideVerdict(baseInput({ plannerStatus: 'ambiguous' }));
    expect(resPlanAmb.verdict).toBe('NEEDS_REVIEW');
    expect(resPlanAmb.classification).toBe('AMBIGUOUS');
    expect(resPlanAmb.exitCode).toBe(11);
  });

  it('Row 4: stuck, budget, or guard violation returns FAIL_UNREPAIRABLE exit 12', () => {
    const resStuck = decideVerdict(baseInput({ plannerStatus: 'stuck' }));
    expect(resStuck.verdict).toBe('FAIL_UNREPAIRABLE');
    expect(resStuck.exitCode).toBe(12);
    expect(resStuck.classification).toBeNull();

    const resBudget = decideVerdict(baseInput({ plannerStatus: 'budget' }));
    expect(resBudget.verdict).toBe('FAIL_UNREPAIRABLE');
    expect(resBudget.exitCode).toBe(12);

    const resGuard = decideVerdict(baseInput({ guardViolation: true }));
    expect(resGuard.verdict).toBe('FAIL_UNREPAIRABLE');
    expect(resGuard.exitCode).toBe(12);

    // If repaired before getting stuck/guardViolation -> BREAKING_UI
    const resStuckRepaired = decideVerdict(
      baseInput({ plannerStatus: 'stuck', repaired: true }),
    );
    expect(resStuckRepaired.verdict).toBe('FAIL_UNREPAIRABLE');
    expect(resStuckRepaired.classification).toBe('BREAKING_UI');
  });

  it('Row 5: repaired with passing oracles returns HEALED_PASS exit 0', () => {
    const resRepaired = decideVerdict(baseInput({ repaired: true }));
    expect(resRepaired.verdict).toBe('HEALED_PASS');
    expect(resRepaired.classification).toBe('HARMLESS_UI');
    expect(resRepaired.exitCode).toBe(0);

    // If replanned -> BREAKING_UI
    const resReplanned = decideVerdict(
      baseInput({ repaired: true, replanned: true }),
    );
    expect(resReplanned.verdict).toBe('HEALED_PASS');
    expect(resReplanned.classification).toBe('BREAKING_UI');
    expect(resReplanned.exitCode).toBe(0);

    // Reused repair when not known-good
    const resReused = decideVerdict(
      baseInput({ reusedRepair: true, planIsKnownGood: false }),
    );
    expect(resReused.verdict).toBe('HEALED_PASS');
    expect(resReused.exitCode).toBe(0);
  });

  it('Row 6: all required oracles passing returns PASS exit 0', () => {
    const resPass = decideVerdict(baseInput());
    expect(resPass.verdict).toBe('PASS');
    expect(resPass.classification).toBeNull();
    expect(resPass.exitCode).toBe(0);
  });

  // ─── Named tests from WORKSPLIT card ────────────────────────────────────────

  it('[R-PS-06] UI change with passing backend oracles → HEALED_PASS; same UI with failed backend oracle → APP_BUG', () => {
    const uiHealedInput = baseInput({
      repaired: true,
      replanned: false,
      oracleResults: [
        {
          oracleId: 'order-created',
          type: 'backend_state',
          ok: true,
          supportingOnly: false,
          detail: {},
        },
      ],
    });
    expect(decideVerdict(uiHealedInput).verdict).toBe('HEALED_PASS');

    const uiFailedBackendInput = baseInput({
      repaired: true,
      replanned: false,
      oracleResults: [
        {
          oracleId: 'order-created',
          type: 'backend_state',
          ok: false,
          supportingOnly: false,
          detail: {},
        },
      ],
    });
    expect(decideVerdict(uiFailedBackendInput).verdict).toBe('APP_BUG');
  });

  it('[R-SC-B] appError with dom_state ok and backend failed → APP_BUG exit 10', () => {
    const input = baseInput({
      appError: true,
      oracleResults: [
        {
          oracleId: 'dom-text',
          type: 'dom_state',
          ok: true,
          supportingOnly: true,
          detail: {},
        },
        {
          oracleId: 'order-created',
          type: 'backend_state',
          ok: false,
          supportingOnly: false,
          detail: {},
        },
      ],
    });
    const decision = decideVerdict(input);
    expect(decision.verdict).toBe('APP_BUG');
    expect(decision.exitCode).toBe(10);
  });

  it('supporting-only oracle failing alone does not change PASS', () => {
    const input = baseInput({
      oracleResults: [
        {
          oracleId: 'order-created',
          type: 'backend_state',
          ok: true,
          supportingOnly: false,
          detail: {},
        },
        {
          oracleId: 'dom-text',
          type: 'dom_state',
          ok: false, // supporting oracle fails
          supportingOnly: true,
          detail: {},
        },
      ],
    });
    expect(allRequiredPass(input.oracleResults)).toBe(true);
    const decision = decideVerdict(input);
    expect(decision.verdict).toBe('PASS');
    expect(decision.exitCode).toBe(0);
  });

  it('exitCodeFor maps each verdict to standard exit code', () => {
    expect(exitCodeFor('PASS')).toBe(0);
    expect(exitCodeFor('HEALED_PASS')).toBe(0);
    expect(exitCodeFor('APP_BUG')).toBe(10);
    expect(exitCodeFor('NEEDS_REVIEW')).toBe(11);
    expect(exitCodeFor('FAIL_UNREPAIRABLE')).toBe(12);
  });
});
