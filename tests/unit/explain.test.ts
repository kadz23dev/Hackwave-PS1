import { describe, it, expect } from 'vitest';
import {
  explainChange,
  explainReplan,
  explainAppBug,
  explainAmbiguous,
  explainVerdict,
  maskSecrets,
} from '../../src/explain/templates.js';
import { tempDb } from '../helpers/db.js';

describe('Explanations unit tests — T14', () => {
  it('[R-PS-03] explanation for HEALED_PASS cites change ids, old and new targets and oracle ids', () => {
    const step = {
      stepId: 's1',
      action: 'click',
      target: { name: 'Add to cart', selector: '#add-GZ-MINI' },
    };
    const item = { evidence: "name 'Add to cart'→'Add to bag', id removed" };
    const match = {
      best: { role: 'button', name: 'Add to bag', ref: 'e4', score: 0.79 },
    };
    const goal = 'Complete checkout with a valid credit card.';
    const oracleIds = ['order-created', 'no-server-errors'];

    const changeExp = explainChange(step, item, match, goal, oracleIds);
    const change = {
      id: 1,
      changeId: 1,
      explanation: changeExp,
    };

    const outcome = {
      verdict: 'HEALED_PASS',
      oracleResults: [
        { id: 'order-created', ok: true },
        { id: 'no-server-errors', ok: true },
        { id: 'order-api-ok', ok: true },
      ],
    };

    const text = explainVerdict(outcome, [change], null);

    // Cites change id
    expect(text).toContain('Change #1');
    // Cites old target name and selector
    expect(text).toContain('Add to cart');
    expect(text).toContain('#add-GZ-MINI');
    // Cites new target role, name, and ref
    expect(text).toContain('button');
    expect(text).toContain('Add to bag');
    expect(text).toContain('e4');
    // Cites oracle ids
    expect(text).toContain('order-created');
    expect(text).toContain('no-server-errors');
  });

  it('APP_BUG explanation cites the failed oracle detail and the 5xx path', () => {
    const failedOracleDetail = 'order-created expected 1 order but found 0';
    const serverErrorSummary = 'POST /api/orders returned 500';

    const text = explainAppBug(failedOracleDetail, serverErrorSummary);

    // Cites failed oracle detail
    expect(text).toContain('order-created expected 1 order but found 0');
    // Cites 5xx path
    expect(text).toContain('POST /api/orders');
    // Exact sentence semantics from PRD §10.7
    expect(text).toContain('This is an application failure, not a UI change. The repair was rejected.');

    // Also verify when called through explainVerdict
    const verdictText = explainVerdict({
      verdict: 'APP_BUG',
      oracleResults: [
        { id: 'order-created', ok: false, reason: 'count 0' },
        { id: 'no-server-errors', ok: false, reason: 'POST /api/orders 500' },
      ],
      failureDetail: 'order-created count 0',
      serverErrorSummary: 'POST /api/orders 500',
    });

    expect(verdictText).toContain('order-created count 0');
    expect(verdictText).toContain('POST /api/orders 500');
    expect(verdictText).toContain('repair was rejected');
  });

  it('ambiguous explanation lists each candidate with its score', () => {
    const candidates = [
      { name: 'Pay', score: 0.75 },
      { name: 'Complete order', score: 0.74 },
    ];

    const text = explainAmbiguous('s2', candidates);

    expect(text).toContain('s2');
    expect(text).toContain('2 equally plausible replacements');
    expect(text).toContain('Pay (0.75)');
    expect(text).toContain('Complete order (0.74)');
    expect(text).toContain('HealTest will not guess. A human must choose in the dashboard.');
  });

  it('explanations never contain the card number', () => {
    const rawCard = '4242424242424242';
    const intent = {
      data: {
        cardNumber: rawCard,
        cvc: '123',
        expiry: '12/30',
      },
    };

    // 1. maskSecrets directly
    const masked = maskSecrets(`Entered card ${rawCard} cvc 123 expiry 12/30`, intent);
    expect(masked).not.toContain(rawCard);
    expect(masked).toContain('****4242');
    expect(masked).not.toContain('123');
    expect(masked).not.toContain('12/30');

    // 2. All template functions with intent mask secrets
    const changeText = explainChange(
      {
        stepId: 's1',
        action: 'fill',
        target: { name: `Card ${rawCard}`, selector: '#card' },
      },
      { evidence: `value was ${rawCard}` },
      null,
      'Pay',
      ['order-created'],
      intent
    );
    expect(changeText).not.toContain(rawCard);
    expect(changeText).toContain('****4242');

    const replanText = explainReplan(
      {
        stepId: 's1',
        oldName: `Card ${rawCard}`,
        oldPath: '/checkout',
        curPath: '/payment',
        best: 0.4,
        strong: 0.6,
        from: 's1',
        to: 's5',
      },
      intent
    );
    expect(replanText).not.toContain(rawCard);
    expect(replanText).toContain('****4242');

    const appBugText = explainAppBug(`Card ${rawCard} failed`, `POST ${rawCard} 500`, intent);
    expect(appBugText).not.toContain(rawCard);
    expect(appBugText).toContain('****4242');

    const ambText = explainAmbiguous('s1', [{ name: `Card ${rawCard}`, score: 0.7 }], intent);
    expect(ambText).not.toContain(rawCard);
    expect(ambText).toContain('****4242');

    // 3. Database persistence & Self-Check verification:
    // Insert run with explanation and ensure raw card number never hits the DB
    const { db, repo } = tempDb();
    repo.upsertSite('shop', 'http://127.0.0.1:4101', []);
    const intentRow = repo.upsertIntentVersion('checkout', 'sha123', 'yaml');
    const runId = repo.insertRun({
      intentId: intentRow.id,
      intentSha: 'sha123',
      kind: 'run',
      targetOrigin: 'http://127.0.0.1:4101',
    });

    const runExplanation = explainVerdict(
      {
        verdict: 'PASS',
        oracleResults: [{ id: 'order-created', ok: true }],
      },
      [{ id: 1, explanation: `Purchased with ${rawCard}` }],
      null,
      intent
    );

    repo.finishRun(runId, {
      verdict: 'PASS',
      explanation: runExplanation,
      llmCalls: 0,
      evidence: [],
    });

    // Query SQLite database directly to confirm 0 hits for the raw card
    const hits = db
      .prepare('SELECT id, explanation FROM runs WHERE explanation LIKE ?')
      .all(`%${rawCard}%`);
    expect(hits).toHaveLength(0);

    const storedRun = db
      .prepare('SELECT explanation FROM runs WHERE id = ?')
      .get(runId) as { explanation: string };
    expect(storedRun.explanation).not.toContain(rawCard);
    expect(storedRun.explanation).toContain('****4242');
  });
});
