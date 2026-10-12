import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { runIntent } from '../../src/pipeline/run.js';
import { telemetry } from '../../src/repair/telemetry.js';
import { attemptAiRecovery } from '../../src/repair/ai-fallback.js';
import type { LlmClient } from '../../src/llm/client.js';
import type { PageSnapshot, Step, TargetFingerprint, Intent } from '../../src/types.js';

describe('Self-Healing Software Testing System — 6 Required Scenarios & Telemetry', { timeout: 120000 }, () => {
  let fV1: { url: string; stop(): Promise<void> } | undefined;
  let fV2: { url: string; stop(): Promise<void> } | undefined;
  let fV2Bug: { url: string; stop(): Promise<void> } | undefined;
  let fV2Ambiguous: { url: string; stop(): Promise<void> } | undefined;

  beforeAll(async () => {
    fV1 = await startFixture('shop-v1', '4101');
    fV2 = await startFixture('shop-v2', '4102');
    fV2Bug = await startFixture('shop-v2-bug', '4103');
    fV2Ambiguous = await startFixture('shop-v2-ambiguous', '4104');
  });

  afterAll(async () => {
    if (fV1) await fV1.stop();
    if (fV2) await fV2.stop();
    if (fV2Bug) await fV2Bug.stop();
    if (fV2Ambiguous) await fV2Ambiguous.stop();
  });

  beforeEach(() => {
    telemetry.clear();
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Button Name Changed
  // Version A: 'Checkout' -> Version B: 'Proceed to payment'
  // Deterministic semantic matching identifies candidate; 0 AI calls made.
  // --------------------------------------------------------------------------
  it('Scenario 1: Button Name Changed → Deterministic semantic matching recovers, 0 AI calls, HEALED_PASS', async () => {
    const { db, path: dbPath } = tempDb();

    // 1. Baseline on shop-v1
    const baseline = await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
      llm: 'off',
    });
    expect(baseline.verdict).toBe('PASS');
    expect(baseline.exitCode).toBe(0);

    // 2. Replay on shop-v2 (button renamed: Checkout -> Proceed to payment, Add to cart -> Add to bag)
    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
      llm: 'off',
    });

    expect(v2Outcome.verdict).toBe('HEALED_PASS');
    expect(v2Outcome.exitCode).toBe(0);
    expect(v2Outcome.llmCalls).toBe(0); // AI was not invoked!
    expect(v2Outcome.repairId).not.toBeNull();

    // Verify repair status was validated
    const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(v2Outcome.repairId) as { status: string; proposer: string };
    expect(repair.status).toBe('validated');
    expect(repair.proposer).toBe('heuristic');

    // Telemetry check
    const metrics = telemetry.getMetrics();
    expect(metrics.deterministicRecoveries).toBeGreaterThanOrEqual(1);
    expect(metrics.aiFallbackInvocations).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Button Relocated
  // Button moved to a different container/nav bar while preserving function.
  // Context-aware matching uses surrounding evidence (nearText, section) to locate it.
  // --------------------------------------------------------------------------
  it('Scenario 2: Button Relocated → Context-aware matching identifies relocated element, HEALED_PASS', async () => {
    const { path: dbPath } = tempDb();

    // Baseline on shop-v1
    await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
      llm: 'off',
    });

    // In shop-v2, cart button moved from header to <nav> sidebar with aria-label="Shopping bag"
    // and Checkout button in bag moved above the items list.
    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2!.url, {
      db: dbPath,
      headless: true,
      llm: 'off',
    });

    expect(v2Outcome.verdict).toBe('HEALED_PASS');
    expect(v2Outcome.exitCode).toBe(0);

    // Order was confirmed and backend received order
    const res = await fetch(`${fV2!.url}/__state`);
    const state = (await res.json()) as { orders: unknown[] };
    expect(state.orders).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Genuine Application or Backend Failure
  // Intended element is identifiable and clicked, but application returns 500.
  // Self-healing reports APP_BUG and does NOT falsely heal test.
  // --------------------------------------------------------------------------
  it('Scenario 3: Genuine Application/Backend Failure → Reports APP_BUG, repair rejected, does not hide defect', async () => {
    const { db, path: dbPath } = tempDb();

    // Baseline on shop-v1
    await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
      llm: 'off',
    });

    // Replay on shop-v2-bug (elements match shop-v2, but backend POST /api/orders returns 500)
    const bugOutcome = await runIntent('intents/checkout.intent.yaml', fV2Bug!.url, {
      db: dbPath,
      headless: true,
      llm: 'off',
    });

    expect(bugOutcome.verdict).toBe('APP_BUG');
    expect(bugOutcome.exitCode).toBe(10);
    expect(bugOutcome.repairId).not.toBeNull();

    // Repair status MUST be rejected
    const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(bugOutcome.repairId) as { status: string };
    expect(repair.status).toBe('rejected');

    // 0 orders created in backend
    const res = await fetch(`${fV2Bug!.url}/__state`);
    const state = (await res.json()) as { orders: unknown[] };
    expect(state.orders).toHaveLength(0);

    // Telemetry tracks genuine failure
    const metrics = telemetry.getMetrics();
    expect(metrics.genuineApplicationFailures).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Ambiguous Elements
  // Multiple plausible candidates with similar confidence scores within margin.
  // Deterministic layer detects ambiguity, AI confirms ambiguity cannot be safely resolved.
  // System reports NEEDS_REVIEW (AMBIGUOUS), never guesses or clicks.
  // --------------------------------------------------------------------------
  it('Scenario 4: Ambiguous Elements → Reports Unresolved: Ambiguous Choices, never guesses or clicks', async () => {
    const { db, path: dbPath } = tempDb();

    // Mock AI that confirms ambiguity
    const ambiguousAiLlm: LlmClient = {
      calls: 0,
      async completeJson() {
        this.calls++;
        return {
          status: 'ambiguous',
          recommendedRef: null,
          reason: 'Both "Pay" and "Complete order" are equally plausible checkout actions in this section.',
        };
      },
    };

    // Baseline on shop-v1
    await runIntent('intents/checkout.intent.yaml', fV1!.url, {
      db: dbPath,
      headless: true,
      llm: 'off',
    });

    // Run on shop-v2-ambiguous
    const ambOutcome = await runIntent('intents/checkout.intent.yaml', fV2Ambiguous!.url, {
      db: dbPath,
      headless: true,
      llmClient: ambiguousAiLlm,
    });

    // Must report NEEDS_REVIEW with exitCode 11 and AMBIGUOUS classification
    expect(ambOutcome.verdict).toBe('NEEDS_REVIEW');
    expect(ambOutcome.exitCode).toBe(11);
    expect(ambOutcome.classification).toBe('AMBIGUOUS');

    // Verify repair record contains pendingChoice exposing the competing candidates
    const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(ambOutcome.repairId) as {
      status: string;
      proposal_json: string;
    };
    expect(repair.status).toBe('needs_review');
    const proposal = JSON.parse(repair.proposal_json) as {
      pendingChoice?: { stepId: string; candidates: Array<{ name: string; score: number }> };
    };
    expect(proposal.pendingChoice).toBeDefined();
    expect(proposal.pendingChoice?.candidates.length).toBeGreaterThanOrEqual(2);

    // Verify telemetry tracked unresolved ambiguity
    const metrics = telemetry.getMetrics();
    expect(metrics.unresolvedAmbiguousCases).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: AI Fallback Successfully Recovers
  // Deterministic recovery layer cannot find a sufficiently reliable candidate,
  // but AI proposes a valid replacement which is strictly validated (G2) and executed.
  // --------------------------------------------------------------------------
  it('Scenario 5: AI Fallback Successfully Recovers → Validates recommendation (G2) and passes', async () => {
    const fakeSnapshot: PageSnapshot = {
      id: 99,
      pagePath: '/bag',
      url: 'http://127.0.0.1:4102/bag',
      title: 'Shopping Bag',
      headings: ['Your bag'],
      elements: [
        {
          ref: 'e-pay-btn',
          role: 'button',
          name: 'Proceed to payment',
          tag: 'button',
          text: 'Proceed to payment',
          label: 'Proceed to payment',
          attrs: { 'aria-label': 'Proceed to payment' },
          nearText: 'Your bag',
          bbox: { x: 100, y: 120, w: 200, h: 40 },
          visible: true,
          enabled: true,
          empty: false,
          checked: null,
          selector: 'button[aria-label="Proceed to payment"]',
        },
      ],
      ariaYaml: '',
      contentHash: 'hash-bag',
      screenshotPath: null,
    };

    const target: TargetFingerprint = {
      role: 'button',
      name: 'Finalize Transaction', // Novel name not in synonyms, scoring low
      tag: 'button',
      text: 'Finalize Transaction',
      label: 'Finalize Transaction',
      attrs: {},
      nearText: 'Your bag',
      bbox: { x: 100, y: 100, w: 100, h: 30 },
      selector: '#finalize-tx',
      snapshotId: 98,
      ref: 'e-orig',
    };

    const step: Step = {
      stepId: 's3',
      pagePath: '/bag',
      action: 'click',
      target,
      dataKey: null,
      provenance: 'planner',
    };

    const intent: Intent = {
      name: 'checkout',
      site: 'gizmo-shop',
      goal: 'Complete checkout',
      startPath: '/',
      allowedOrigins: ['http://127.0.0.1:4102'],
      actionBudget: 20,
      data: {},
      expected: [],
      planner: { doneWhen: { pathPattern: '^/confirmation' } },
    };

    const mockAiLlm: LlmClient = {
      calls: 0,
      async completeJson() {
        this.calls++;
        return {
          status: 'recovered',
          recommendedRef: 'e-pay-btn',
          reason: 'Identified Proceed to payment as the intended checkout action on the bag page',
          confidence: 0.94,
        };
      },
    };

    const result = await attemptAiRecovery(
      {
        step,
        target,
        snap: fakeSnapshot,
        candidatesExamined: [],
        deterministicReason: 'No candidates met strong threshold',
        intent,
      },
      mockAiLlm,
      'live'
    );

    expect(result.kind).toBe('recovered');
    expect(result.candidate).not.toBeNull();
    expect(result.candidate?.ref).toBe('e-pay-btn');
    expect(result.candidate?.name).toBe('Proceed to payment');
    expect(result.confidence).toBe(0.94);
    expect(mockAiLlm.calls).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 6: AI Fallback Also Fails
  // Deterministic recovery fails, AI fallback returns stuck or invalid element.
  // System terminates safely, does not falsely mark as passed.
  // --------------------------------------------------------------------------
  it('Scenario 6: AI Fallback Also Fails → Terminates safely, reports failure, never falsely passes', async () => {
    const fakeSnapshot: PageSnapshot = {
      id: 100,
      pagePath: '/bag',
      url: 'http://127.0.0.1:4102/bag',
      title: 'Shopping Bag',
      headings: ['Your bag'],
      elements: [
        {
          ref: 'e-disabled-btn',
          role: 'button',
          name: 'Proceed to payment',
          tag: 'button',
          text: 'Proceed to payment',
          label: 'Proceed to payment',
          attrs: {},
          nearText: 'Your bag',
          bbox: { x: 100, y: 120, w: 200, h: 40 },
          visible: true,
          enabled: false, // Disabled! Violates Guardrail G2
          empty: false,
          checked: null,
          selector: '#proceed-disabled',
        },
      ],
      ariaYaml: '',
      contentHash: 'hash-bag',
      screenshotPath: null,
    };

    const target: TargetFingerprint = {
      role: 'button',
      name: 'Checkout',
      tag: 'button',
      text: 'Checkout',
      label: 'Checkout',
      attrs: {},
      nearText: 'Cart',
      bbox: { x: 100, y: 100, w: 100, h: 30 },
      selector: '#checkout',
      snapshotId: 98,
      ref: 'e-orig',
    };

    const step: Step = {
      stepId: 's3',
      pagePath: '/bag',
      action: 'click',
      target,
      dataKey: null,
      provenance: 'planner',
    };

    const intent: Intent = {
      name: 'checkout',
      site: 'gizmo-shop',
      goal: 'Complete checkout',
      startPath: '/',
      allowedOrigins: ['http://127.0.0.1:4102'],
      actionBudget: 20,
      data: {},
      expected: [],
      planner: { doneWhen: { pathPattern: '^/confirmation' } },
    };

    // Case 6A: AI returns stuck
    const stuckAiLlm: LlmClient = {
      calls: 0,
      async completeJson() {
        this.calls++;
        return {
          status: 'stuck',
          recommendedRef: null,
          reason: 'Target button does not exist on page',
        };
      },
    };

    const resA = await attemptAiRecovery(
      {
        step,
        target,
        snap: fakeSnapshot,
        candidatesExamined: [],
        deterministicReason: 'No candidates met strong threshold',
        intent,
      },
      stuckAiLlm,
      'live'
    );
    expect(resA.kind).toBe('stuck');
    expect(resA.candidate).toBeNull();

    // Case 6B: AI proposes a disabled element (G2 violation)
    const badAiLlm: LlmClient = {
      calls: 0,
      async completeJson() {
        this.calls++;
        return {
          status: 'recovered',
          recommendedRef: 'e-disabled-btn',
          reason: 'Recommend disabled button',
        };
      },
    };

    const resB = await attemptAiRecovery(
      {
        step,
        target,
        snap: fakeSnapshot,
        candidatesExamined: [],
        deterministicReason: 'No candidates met strong threshold',
        intent,
      },
      badAiLlm,
      'live'
    );
    // Validator safely rejects disabled element
    expect(resB.kind).toBe('stuck');
    expect(resB.candidate).toBeNull();
    expect(resB.reason).toContain('not visible or enabled');
  });

  // --------------------------------------------------------------------------
  // Measurement: AI Workload Saved & Metrics Verification
  // --------------------------------------------------------------------------
  it('Measurement: Calculates AI Workload Saved, Rates, and Avoided Costs', () => {
    // Record representative telemetry metrics
    telemetry.recordRun({
      totalTestRuns: 10,
      originalSelectorFailures: 8,
      deterministicRecoveryAttempts: 8,
      deterministicRecoveries: 6,
      aiFallbackInvocations: 2,
      aiAssistedRecoveries: 1,
      aiFallbackFailures: 1,
      unresolvedAmbiguousCases: 1,
      genuineApplicationFailures: 1,
      finalAssertionPasses: 7,
      finalAssertionFailures: 3,
    });

    const savings = telemetry.calculateSavings();

    // 1. Deterministic Recovery Rate = (6 / 8) * 100 = 75.0%
    expect(savings.deterministicRecoveryRate).toBe(75.0);

    // 2. AI Invocation Rate = (2 / 8) * 100 = 25.0%
    expect(savings.aiInvocationRate).toBe(25.0);

    // 3. Estimated AI Calls Avoided = 8 - 2 = 6 calls
    expect(savings.estimatedAiCallsAvoided).toBe(6);

    // 4. Estimated AI Workload Saved
    expect(savings.estimatedTokensSaved).toBe(6 * 850); // 5100 tokens
    expect(savings.estimatedLatencySavedMs).toBe(6 * 1600); // 9600 ms
    expect(savings.estimatedCostSavedUsd).toBe(Number((6 * 0.002).toFixed(4))); // $0.012

    // 5. Recovery Success Rate = (6 + 1) / (8 + 2) * 100 = 70.0%
    expect(savings.recoverySuccessRate).toBe(70.0);

    // Transparent assumptions disclosed
    expect(savings.assumptions.baselineStrategy).toBeDefined();
    expect(savings.assumptions.avgTokensPerLlmCall).toBe(850);
  });
});
