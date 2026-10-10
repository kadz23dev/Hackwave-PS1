import { describe, it, expect } from 'vitest';
import type { LlmClient } from '../../src/llm/client.js';
import { LlmPlanner, type LlmPlannerState } from '../../src/planner/llm.js';
import type { Intent, PageSnapshot } from '../../src/types.js';
import { ReplayClient } from '../../src/llm/replay.js';

class FakeLlm implements LlmClient {
  calls = 0;
  constructor(public reply: unknown) {}

  async completeJson(): Promise<unknown> {
    this.calls++;
    return this.reply;
  }
}

function makeMockState(overrides?: {
  elements?: PageSnapshot['elements'];
  data?: Record<string, string>;
}): LlmPlannerState {
  const snap: PageSnapshot = {
    id: 1,
    pagePath: '/checkout',
    url: 'http://localhost/checkout',
    title: 'Checkout',
    headings: ['Checkout'],
    elements: overrides?.elements ?? [
      {
        ref: 'e1',
        role: 'textbox',
        name: 'Card Number',
        tag: 'input',
        text: '',
        label: 'Card Number',
        attrs: { id: 'card' },
        nearText: 'Payment',
        bbox: { x: 10, y: 10, w: 100, h: 30 },
        visible: true,
        enabled: true,
        empty: true,
        checked: null,
        selector: '#card',
      },
    ],
    ariaYaml: '',
    contentHash: 'hash1',
    screenshotPath: null,
  };

  const intent: Intent = {
    name: 'test-intent',
    site: 'shop',
    startPath: '/',
    allowedOrigins: ['http://localhost'],
    actionBudget: 10,
    goal: 'Complete checkout',
    data: overrides?.data ?? {
      cardNumber: '4242424242424242',
      email: 'test@example.com',
    },
    planner: {
      doneWhen: { pathPattern: '^/order-confirmation' },
    },
    expected: [],
  };

  return {
    snap,
    intent,
    completedSteps: [],
  };
}

describe('LLM planner guardrails — G2, G3, prompt privacy (T11)', () => {
  it('[R-F4-02] an LLM reply with a ref not in the snapshot is rejected', async () => {
    const state = makeMockState();
    const fakeLlm = new FakeLlm({
      action: 'click',
      ref: 'e999_unobserved',
      dataKey: null,
      reason: 'Hallucinated element',
    });

    const result = await LlmPlanner.nextAction(state, fakeLlm);
    expect(fakeLlm.calls).toBe(1);
    expect(result).toEqual({ kind: 'stuck' });
  });

  it('[R-F4-03] an LLM reply with a dataKey not in intent.data is rejected', async () => {
    const state = makeMockState({
      data: { email: 'allowed@example.com' },
    });
    const fakeLlm = new FakeLlm({
      action: 'fill',
      ref: 'e1',
      dataKey: 'unauthorizedKey',
      reason: 'Trying to fill unapproved data key',
    });

    const result = await LlmPlanner.nextAction(state, fakeLlm);
    expect(fakeLlm.calls).toBe(1);
    expect(result).toEqual({ kind: 'stuck' });
  });

  it('prompt never leaks intent.data values', () => {
    const state = makeMockState({
      data: {
        cardNumber: '4242424242424242',
        email: 'secret@domain.com',
      },
    });

    const { system, user } = LlmPlanner.buildPrompt(state);

    // Prompt MUST NOT contain secret values
    expect(user).not.toContain('4242424242424242');
    expect(system).not.toContain('4242424242424242');
    expect(user).not.toContain('secret@domain.com');
    expect(system).not.toContain('secret@domain.com');

    // Prompt MUST contain the data keys
    expect(user).toContain('cardNumber');
    expect(user).toContain('email');
  });

  it('ReplayClient cache miss returns { action: "stuck" } without throwing', async () => {
    const client = new ReplayClient('replay', undefined, 'mock-model', 'tmp/non-existent-dir');
    const result = (await client.completeJson('sys', 'user')) as { action?: string };
    expect(result).toEqual({ action: 'stuck' });
  });
});
