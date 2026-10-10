import { describe, it, expect } from 'vitest';
import { nextAction } from '../../src/planner/heuristic.js';
import type { ElementRecord, Intent, PageSnapshot, Step } from '../../src/types.js';

function makeSnapshot(elements: Partial<ElementRecord>[], path = '/'): PageSnapshot {
  return {
    pagePath: path,
    url: `http://127.0.0.1:4101${path}`,
    title: 'Test Page',
    headings: [],
    ariaYaml: '',
    contentHash: 'hash-test',
    screenshotPath: null,
    elements: elements.map((e, idx) => ({
      ref: e.ref ?? `e${idx + 1}`,
      role: e.role ?? 'button',
      name: e.name ?? '',
      tag: e.tag ?? 'button',
      text: e.text ?? '',
      label: e.label ?? '',
      attrs: e.attrs ?? {},
      nearText: e.nearText ?? '',
      bbox: e.bbox ?? { x: 0, y: 0, w: 100, h: 40 },
      visible: e.visible ?? true,
      enabled: e.enabled ?? true,
      empty: e.empty ?? false,
      checked: e.checked ?? null,
      selector: e.selector ?? `#el-${idx + 1}`,
    })),
  };
}

function makeIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    name: 'test-intent',
    site: 'test-site',
    goal: 'Test checkout',
    startPath: '/',
    allowedOrigins: ['http://127.0.0.1:4101'],
    actionBudget: 15,
    data: {
      email: 'alice@example.com',
      address: '123 Main St',
      product: 'Gizmo Mini',
    },
    planner: {
      doneWhen: { pathPattern: '^/confirmation' },
    },
    expected: [],
    ...overrides,
  };
}

describe('Heuristic planner unit tests', () => {
  it('fills email before address when label is \'Email address\'', () => {
    const snap = makeSnapshot([
      {
        ref: 'e1',
        role: 'textbox',
        name: '',
        label: 'Email address',
        empty: true,
      },
    ]);
    const intent = makeIntent();

    const res = nextAction({
      snap,
      intent,
      completedSteps: [],
      clickedOnPath: new Set(),
    });

    expect(res).toEqual({
      kind: 'act',
      action: 'fill',
      ref: 'e1',
      dataKey: 'email',
    });
  });

  it('\'Add to cart\' is never a cart-stage candidate', () => {
    const snap = makeSnapshot([
      {
        ref: 'e1',
        role: 'button',
        name: 'Add to cart',
        nearText: 'Gizmo Mini',
      },
    ]);
    const intent = makeIntent();

    // Pretend a product was already added so add stage is skipped,
    // and cart stage is evaluated
    const completedSteps: Step[] = [
      {
        stepId: 's1',
        action: 'click',
        pagePath: '/',
        target: {
          role: 'button',
          name: 'Add to cart',
          tag: 'button',
          text: 'Add to cart',
          label: '',
          attrs: {},
          nearText: 'Gizmo Mini',
          bbox: { x: 0, y: 0, w: 10, h: 10 },
          selector: '#add',
          snapshotId: 1,
          ref: 'e1',
        },
        dataKey: null,
        provenance: 'planner',
      },
    ];

    const res = nextAction({
      snap,
      intent,
      completedSteps,
      clickedOnPath: new Set(),
    });

    // Since 'Add to cart' is in stage 'add', it never matches stage 'cart'.
    // With 'add' stage skipped, no candidate remains and the planner is stuck.
    expect(res.kind).toBe('stuck');
  });

  it('two different pay-stage names → ambiguous', () => {
    const snap = makeSnapshot([
      {
        ref: 'e1',
        role: 'button',
        name: 'Pay now',
      },
      {
        ref: 'e2',
        role: 'button',
        name: 'Complete order',
      },
    ]);
    const intent = makeIntent();

    const res = nextAction({
      snap,
      intent,
      completedSteps: [],
      clickedOnPath: new Set(),
    });

    expect(res.kind).toBe('ambiguous');
    if (res.kind === 'ambiguous') {
      expect(res.candidates).toHaveLength(2);
      expect(res.candidates.map(c => c.name)).toEqual(['Pay now', 'Complete order']);
    }
  });

  it('doneWhen path → done', () => {
    const snap = makeSnapshot([], '/confirmation');
    const intent = makeIntent();

    const res = nextAction({
      snap,
      intent,
      completedSteps: [],
      clickedOnPath: new Set(),
    });

    expect(res).toEqual({ kind: 'done' });
  });
});
