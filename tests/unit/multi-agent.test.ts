import { describe, it, expect, beforeEach } from 'vitest';
import { MultiAgentBus } from '../../src/agent/multi-agent-bus.js';
import { AGENT_PROFILES } from '../../src/agent/agents.js';
import { openDb } from '../../src/db/index.js';
import { Repo } from '../../src/db/repo.js';

describe('Multi-Agent Playwright Error Detection & Communication', () => {
  let repo: Repo;
  let bus: MultiAgentBus;

  beforeEach(() => {
    const db = openDb(':memory:');
    repo = new Repo(db);
    bus = new MultiAgentBus(repo);
  });

  it('agent profiles define all four cooperating agent roles', () => {
    expect(AGENT_PROFILES.sentinel).toBeDefined();
    expect(AGENT_PROFILES.inspector).toBeDefined();
    expect(AGENT_PROFILES.architect).toBeDefined();
    expect(AGENT_PROFILES.triage).toBeDefined();

    expect(AGENT_PROFILES.sentinel.badge).toBe('PW MONITOR');
    expect(AGENT_PROFILES.inspector.badge).toBe('DOM ANALYST');
    expect(AGENT_PROFILES.architect.badge).toBe('SELECTOR SYNTH');
    expect(AGENT_PROFILES.triage.badge).toBe('ORACLE VERIFIED');
  });

  it('diagnoses UI selector drift with inter-agent debate and self-healing proposal', async () => {
    const result = await bus.diagnosePlaywrightError({
      testName: 'checkout-valid-card.yaml',
      stepIndex: 3,
      totalSteps: 5,
      stepAction: 'click',
      targetSelector: '#add-to-cart',
      targetUrl: 'http://127.0.0.1:4102/cart.html',
      errorMessage: "Timeout 5000ms waiting for locator '#add-to-cart'",
      errorType: 'LOCATOR_NOT_FOUND',
      nearText: 'Complete checkout journey',
    });

    expect(result.ok).toBe(true);
    expect(result.verdict).toBe('HEALED_PASS');
    expect(result.healing).toBeDefined();
    expect(result.healing?.newSelector).toMatch(/add[- ]to[- ]bag/i);

    // Verify inter-agent communication
    expect(result.conversation.length).toBeGreaterThanOrEqual(4);
    const senders = result.conversation.map(m => m.sender);
    expect(senders).toContain('sentinel');
    expect(senders).toContain('inspector');
    expect(senders).toContain('architect');
    expect(senders).toContain('triage');

    // Verify logs
    expect(result.logs.some(l => l.level === 'warn')).toBe(true);
    expect(result.logs.some(l => l.level === 'heal')).toBe(true);

    // Verify auto-generated note in database
    expect(result.noteCreated).toBeDefined();
    const notesInDb = repo.db.prepare('SELECT * FROM notes').all() as Array<{ title: string }>;
    expect(notesInDb.length).toBeGreaterThan(0);
  });

  it('correctly classifies backend HTTP 500 errors as APP_BUG instead of false-positive healing', async () => {
    const result = await bus.diagnosePlaywrightError({
      testName: 'checkout-valid-card.yaml',
      stepIndex: 3,
      totalSteps: 5,
      stepAction: 'click',
      targetSelector: '#checkout-button',
      targetUrl: 'http://127.0.0.1:4103/checkout.html',
      errorMessage: 'POST /api/orders failed with status 500 Internal Server Error',
      errorType: 'APP_500_ERROR',
      networkErrors: [{ url: 'http://127.0.0.1:4103/api/orders', status: 500, method: 'POST' }],
    });

    expect(result.ok).toBe(true);
    expect(result.verdict).toBe('APP_BUG');
    expect(result.healing?.provenance).toContain('app-bug');

    // Check sentinel alerted 500
    const sentinelMsg = result.conversation.find(m => m.sender === 'sentinel');
    expect(sentinelMsg?.text).toContain('500');

    // Check triage message addressed the error
    const triageMsg = result.conversation.find(m => m.sender === 'triage');
    expect(triageMsg?.text.toLowerCase()).toMatch(/bug|defect|500|error|fail/);
  });

  it('correctly classifies strict mode violations as NEEDS_REVIEW', async () => {
    const result = await bus.diagnosePlaywrightError({
      testName: 'checkout-valid-card.yaml',
      stepIndex: 3,
      totalSteps: 5,
      stepAction: 'click',
      targetSelector: 'button.pay-btn',
      targetUrl: 'http://127.0.0.1:4104/payment.html',
      errorMessage: 'Strict mode violation: 2 elements match locator "button.pay-btn"',
      errorType: 'STRICT_MODE_VIOLATION',
    });

    expect(result.ok).toBe(true);
    expect(result.verdict).toBe('NEEDS_REVIEW');
    expect(result.candidates?.length).toBeGreaterThan(0);
  });

  it('supports direct conversation with agents via talkToAgents', async () => {
    const reply = await bus.talkToAgents(
      'Why should we prioritize accessibility locators like getByRole over xpath?',
      'architect'
    );

    expect(reply.sender).toBe('architect');
    expect(reply.senderName).toContain('Architect');
    expect(reply.badge).toBe('SELECTOR SYNTH');
    expect(reply.text.length).toBeGreaterThan(30);
  });
});
