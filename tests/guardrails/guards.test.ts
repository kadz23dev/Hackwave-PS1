import { describe, it, expect } from 'vitest';
import {
  assertBudget,
  assertDataKey,
  assertNotForbidden,
  assertObserved,
  assertOriginAllowed,
  GuardViolation,
} from '../../src/executor/guards.js';
import { executeStep } from '../../src/executor/executor.js';
import type { ElementRecord, Intent, PageSnapshot, Step } from '../../src/types.js';

describe('Guardrails G2/G3 — guards.test.ts', () => {
  const dummyIntent: Intent = {
    name: 'test-intent',
    site: 'test-site',
    goal: 'Test checkout',
    startPath: '/',
    allowedOrigins: ['http://127.0.0.1:4101'],
    actionBudget: 10,
    data: {
      email: 'user@example.com',
      name: 'Test User',
    },
    planner: {
      doneWhen: { pathPattern: '^/confirmation' },
    },
    expected: [],
  };

  it('[R-F4-03] navigation to a non-allowlisted origin throws GuardViolation ORIGIN', () => {
    // Non-allowlisted origins must throw
    expect(() => {
      assertOriginAllowed('https://malicious.com/attack', dummyIntent);
    }).toThrowError(GuardViolation);

    try {
      assertOriginAllowed('http://127.0.0.1:9999/different-port', dummyIntent);
    } catch (err) {
      expect(err).toBeInstanceOf(GuardViolation);
      expect((err as GuardViolation).code).toBe('ORIGIN');
    }

    // Allowlisted origin and about:blank must pass
    expect(() => {
      assertOriginAllowed('http://127.0.0.1:4101/cart', dummyIntent);
    }).not.toThrow();

    expect(() => {
      assertOriginAllowed('about:blank', dummyIntent);
    }).not.toThrow();
  });

  it('[R-F4-03] fill with a dataKey not in intent.data throws GuardViolation DATA', () => {
    expect(() => {
      assertDataKey('injectedPassword', dummyIntent);
    }).toThrowError(GuardViolation);

    try {
      assertDataKey('nonExistentKey', dummyIntent);
    } catch (err) {
      expect(err).toBeInstanceOf(GuardViolation);
      expect((err as GuardViolation).code).toBe('DATA');
    }

    // Existing dataKey must pass
    expect(() => {
      assertDataKey('email', dummyIntent);
    }).not.toThrow();
  });

  it('[R-F4-03] exceeding actionBudget throws GuardViolation BUDGET', () => {
    expect(() => {
      assertBudget(11, dummyIntent);
    }).toThrowError(GuardViolation);

    try {
      assertBudget(15, dummyIntent);
    } catch (err) {
      expect(err).toBeInstanceOf(GuardViolation);
      expect((err as GuardViolation).code).toBe('BUDGET');
    }

    // Equal or below budget must pass
    expect(() => {
      assertBudget(10, dummyIntent);
    }).not.toThrow();

    expect(() => {
      assertBudget(5, dummyIntent);
    }).not.toThrow();
  });

  it('[R-F4-02] executing a ref not present in the snapshot throws UNOBSERVED', async () => {
    const snap: PageSnapshot = {
      pagePath: '/',
      url: 'http://127.0.0.1:4101/',
      title: 'Test',
      headings: [],
      elements: [
        {
          ref: 'e1',
          role: 'button',
          name: 'Add to cart',
          tag: 'button',
          text: 'Add to cart',
          label: '',
          attrs: {},
          nearText: '',
          bbox: { x: 0, y: 0, w: 100, h: 40 },
          visible: true,
          enabled: true,
          empty: false,
          checked: null,
          selector: '#btn1',
        },
      ],
      ariaYaml: '',
      contentHash: 'hash1',
      screenshotPath: null,
    };

    expect(() => {
      assertObserved('e99', snap);
    }).toThrowError(GuardViolation);

    try {
      assertObserved('e99', snap);
    } catch (err) {
      expect(err).toBeInstanceOf(GuardViolation);
      expect((err as GuardViolation).code).toBe('UNOBSERVED');
    }

    const unobservedEl: ElementRecord = {
      ref: 'e99',
      role: 'button',
      name: 'Ghost button',
      tag: 'button',
      text: 'Ghost button',
      label: '',
      attrs: {},
      nearText: '',
      bbox: { x: 0, y: 0, w: 100, h: 40 },
      visible: true,
      enabled: true,
      empty: false,
      checked: null,
      selector: '#ghost',
    };

    const step: Step = {
      stepId: 's1',
      action: 'click',
      pagePath: '/',
      target: {
        ...unobservedEl,
        snapshotId: 1,
      },
      dataKey: null,
      provenance: 'planner',
    };

    // Dummy mock page
    const mockPage = {} as unknown as import('playwright').Page;

    await expect(
      executeStep(mockPage, step, unobservedEl, dummyIntent, snap),
    ).rejects.toThrowError(GuardViolation);
  });

  it('assertNotForbidden throws FORBIDDEN on forbidden element names', () => {
    expect(() => assertNotForbidden('Cancel')).toThrowError(GuardViolation);
    expect(() => assertNotForbidden('delete item')).toThrowError(GuardViolation);
    expect(() => assertNotForbidden('logout')).toThrowError(GuardViolation);
    expect(() => assertNotForbidden('continue shopping')).toThrowError(GuardViolation);

    expect(() => assertNotForbidden('Checkout')).not.toThrow();
    expect(() => assertNotForbidden('Add to cart')).not.toThrow();
    expect(() => assertNotForbidden('Proceed to payment')).not.toThrow();
  });
});
