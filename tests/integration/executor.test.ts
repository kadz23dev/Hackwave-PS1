import { describe, it, expect, afterAll } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { openSession, type Session } from '../../src/browser/session.js';
import { captureSnapshot } from '../../src/snapshot/capture.js';
import { executeStep } from '../../src/executor/executor.js';
import type { Intent, Step } from '../../src/types.js';

describe('Executor integration — T07', { timeout: 60000 }, () => {
  let fixtureV1: { url: string; stop(): Promise<void> };
  let session: Session;

  afterAll(async () => {
    if (session) await session.close();
    if (fixtureV1) await fixtureV1.stop();
  });

  it('[R-PS-02] executes click and fill steps on v1 and reaches /checkout', async () => {
    fixtureV1 = await startFixture('shop-v1');

    const intent: Intent = {
      name: 'checkout-valid-card',
      site: 'gizmo-shop',
      goal: 'Complete checkout on shop-v1',
      startPath: '/',
      allowedOrigins: [fixtureV1.url],
      actionBudget: 15,
      data: {
        email: 'alice@example.com',
        name: 'Alice Smith',
      },
      planner: {
        doneWhen: { pathPattern: '^/confirmation' },
      },
      expected: [],
    };

    session = await openSession({ headless: true, intent });

    // Step 1: Open home page and click "Add to cart"
    await session.page.goto(fixtureV1.url + '/');
    await session.page.waitForLoadState('networkidle').catch(() => {});
    const snapHome = await captureSnapshot(session.page, { screenshot: false });

    const addBtn = snapHome.elements.find(
      e => e.role === 'button' && e.name.toLowerCase().includes('add to cart'),
    );
    expect(addBtn, 'Add to cart button should exist on home page').toBeDefined();

    const step1: Step = {
      stepId: 's1',
      action: 'click',
      pagePath: '/',
      target: { ...addBtn!, snapshotId: snapHome.id ?? 1 },
      dataKey: null,
      provenance: 'planner',
    };
    await executeStep(session.page, step1, addBtn!, intent, snapHome);

    // Step 2: Navigate to /cart and click "Checkout"
    await session.page.goto(fixtureV1.url + '/cart');
    await session.page.waitForLoadState('networkidle').catch(() => {});
    const snapCart = await captureSnapshot(session.page, { screenshot: false });

    const checkoutBtn = snapCart.elements.find(
      e => e.role === 'button' && e.name.toLowerCase().includes('checkout'),
    );
    expect(checkoutBtn, 'Checkout button should exist on cart page').toBeDefined();

    const step2: Step = {
      stepId: 's2',
      action: 'click',
      pagePath: '/cart',
      target: { ...checkoutBtn!, snapshotId: snapCart.id ?? 2 },
      dataKey: null,
      provenance: 'planner',
    };
    await executeStep(session.page, step2, checkoutBtn!, intent, snapCart);

    // Verify reached /checkout
    expect(session.page.url()).toContain('/checkout');

    // Step 3: On /checkout, fill the email field
    const snapCheckout = await captureSnapshot(session.page, { screenshot: false });
    const emailInput = snapCheckout.elements.find(
      e => e.role === 'textbox' && e.name.toLowerCase().includes('email'),
    );
    expect(emailInput, 'Email field should exist on checkout page').toBeDefined();

    const step3: Step = {
      stepId: 's3',
      action: 'fill',
      pagePath: '/checkout',
      target: { ...emailInput!, snapshotId: snapCheckout.id ?? 3 },
      dataKey: 'email',
      provenance: 'planner',
    };
    await executeStep(session.page, step3, emailInput!, intent, snapCheckout);

    // Verify input value matches intent.data.email
    const filledValue = await session.page
      .locator(`[data-healtest-ref="${emailInput!.ref}"]`)
      .inputValue();
    expect(filledValue).toBe('alice@example.com');
  });
});
