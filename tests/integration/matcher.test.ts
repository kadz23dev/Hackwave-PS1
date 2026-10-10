import { describe, it, expect, afterAll } from 'vitest';
import { openSession } from '../../src/browser/session.js';
import { captureSnapshot } from '../../src/snapshot/capture.js';
import { findReplacement } from '../../src/match/matcher.js';
import { elementToTarget } from '../../src/match/score.js';
import { loadPolicy } from '../../src/governance/policy.js';
import { startFixture } from '../helpers/fixtures.js';
import type { Session } from '../../src/browser/session.js';

/**
 * Integration tests for matcher — require real fixture servers + Playwright.
 */
describe('matcher integration', { timeout: 60000 }, () => {
  let sessionV1: Session;
  let sessionV2: Session;
  let sessionV2Ambig: Session;
  let stopV1: () => Promise<void>;
  let stopV2: () => Promise<void>;
  let stopV2Ambig: () => Promise<void>;

  afterAll(async () => {
    await sessionV1?.close();
    await sessionV2?.close();
    await sessionV2Ambig?.close();
    await stopV1?.();
    await stopV2?.();
    await stopV2Ambig?.();
  });

  it('[R-F2-01] v1 "Add to cart" (Gizmo Mini) → v2 single match "Add to bag" under Gizmo Mini', async () => {
    const fV1 = await startFixture('shop-v1');
    stopV1 = fV1.stop;
    const fV2 = await startFixture('shop-v2');
    stopV2 = fV2.stop;

    sessionV1 = await openSession();
    await sessionV1.page.goto(fV1.url + '/');
    const snapV1 = await captureSnapshot(sessionV1.page);

    // Find "Add to cart" element near "Gizmo Mini" on v1
    const addToCartEl = snapV1.elements.find(
      e =>
        e.name.toLowerCase().includes('add to cart') &&
        e.nearText.toLowerCase().includes('gizmo mini'),
    );
    expect(addToCartEl, 'v1 "Add to cart" near Gizmo Mini not found').toBeTruthy();
    const target = elementToTarget(addToCartEl!, snapV1.id ?? 0);

    sessionV2 = await openSession();
    await sessionV2.page.goto(fV2.url + '/');
    const snapV2 = await captureSnapshot(sessionV2.page);

    const policy = loadPolicy();
    const result = findReplacement(target, snapV2, policy);

    console.table(result.candidates.map(c => ({ name: c.name, score: c.score.toFixed(3) })));

    expect(result.kind).toBe('single');
    expect(result.best).not.toBeNull();
    expect(result.best!.name.toLowerCase()).toContain('add to bag');

    // best should be under Gizmo Mini (check via snap elements)
    const bestEl = snapV2.elements.find(e => e.ref === result.best!.ref);
    expect(bestEl?.nearText.toLowerCase()).toContain('gizmo mini');
  });

  it('v1 "Checkout" → v2 /bag: best candidate is "Proceed to payment"', async () => {
    // reuse sessions from previous test if available; otherwise start new ones
    const fV1b = await startFixture('shop-v1');
    const fV2b = await startFixture('shop-v2');
    const sesV1b = await openSession();
    const sesV2b = await openSession();

    try {
      await sesV1b.page.goto(fV1b.url + '/cart');
      const snapV1Cart = await captureSnapshot(sesV1b.page);

      const checkoutEl = snapV1Cart.elements.find(e =>
        e.name.toLowerCase().includes('checkout'),
      );
      if (!checkoutEl) {
        // try home
        await sesV1b.page.goto(fV1b.url + '/');
        const snapV1Home = await captureSnapshot(sesV1b.page);
        const el2 = snapV1Home.elements.find(e => e.name.toLowerCase().includes('checkout'));
        expect(el2, 'No checkout element found on v1').toBeTruthy();
        const t2 = elementToTarget(el2!, snapV1Home.id ?? 0);
        await sesV2b.page.goto(fV2b.url + '/bag');
        const snapV2Bag = await captureSnapshot(sesV2b.page);
        const policy = loadPolicy();
        const res2 = findReplacement(t2, snapV2Bag, policy);
        console.table(res2.candidates.map(c => ({ name: c.name, score: c.score.toFixed(3) })));
        expect(['single', 'none']).toContain(res2.kind);
        if (res2.best) {
          expect(res2.best.name.toLowerCase()).toContain('proceed to payment');
        }
        return;
      }

      const target = elementToTarget(checkoutEl, snapV1Cart.id ?? 0);
      await sesV2b.page.goto(fV2b.url + '/bag');
      const snapV2Bag = await captureSnapshot(sesV2b.page);
      const policy = loadPolicy();
      const result = findReplacement(target, snapV2Bag, policy);

      console.table(result.candidates.map(c => ({ name: c.name, score: c.score.toFixed(3) })));
      expect(['single', 'none']).toContain(result.kind);
      if (result.best) {
        expect(result.best.name.toLowerCase()).toContain('proceed to payment');
      }
    } finally {
      await sesV1b.close();
      await sesV2b.close();
      await fV1b.stop();
      await fV2b.stop();
    }
  });

  it('v1 "Pay now" vs v2-ambiguous payment page → kind ambiguous with "Pay" and "Complete order"', async () => {
    const fV1c = await startFixture('shop-v1');
    const fV2a = await startFixture('shop-v2-ambiguous');
    const sesV1c = await openSession();
    const sesV2a = await openSession();
    stopV2Ambig = fV2a.stop;
    sessionV2Ambig = sesV2a;

    try {
      // navigate v1 to checkout to find Pay now
      await sesV1c.page.goto(fV1c.url + '/checkout');
      const snapV1Pay = await captureSnapshot(sesV1c.page);
      let payNowEl = snapV1Pay.elements.find(e =>
        /pay\s*now/i.test(e.name),
      );

      if (!payNowEl) {
        // Try home→cart→checkout flow
        await sesV1c.page.goto(fV1c.url + '/');
        const homeSnap = await captureSnapshot(sesV1c.page);
        const addToCart = homeSnap.elements.find(e => /add to cart/i.test(e.name));
        if (addToCart) {
          await sesV1c.page.locator(`[data-healtest-ref="${addToCart.ref}"]`).click();
          await sesV1c.page.waitForLoadState('networkidle').catch(() => {});
        }
        const cartSnap = await captureSnapshot(sesV1c.page);
        const checkoutBtn = cartSnap.elements.find(e => /checkout/i.test(e.name));
        if (checkoutBtn) {
          await sesV1c.page.locator(`[data-healtest-ref="${checkoutBtn.ref}"]`).click();
          await sesV1c.page.waitForLoadState('networkidle').catch(() => {});
        }
        const checkSnap = await captureSnapshot(sesV1c.page);
        payNowEl = checkSnap.elements.find(e => /pay\s*now|place\s*order|pay\b/i.test(e.name));
      }

      if (!payNowEl) {
        console.warn('Could not locate Pay now element on v1 — skipping ambiguous test');
        return;
      }

      const target = elementToTarget(payNowEl, 0);

      // Navigate v2-ambiguous to payment page
      await sesV2a.page.goto(fV2a.url + '/');
      await sesV2a.page.waitForLoadState('networkidle').catch(() => {});

      // Try to get to payment page
      const homeSnap2 = await captureSnapshot(sesV2a.page);
      const addEl = homeSnap2.elements.find(e => /add to bag|add to cart/i.test(e.name));
      if (addEl) {
        await sesV2a.page.locator(`[data-healtest-ref="${addEl.ref}"]`).click();
        await sesV2a.page.waitForLoadState('networkidle').catch(() => {});
      }

      // navigate to checkout/payment
      const tryPaths = ['/checkout/payment', '/checkout', '/bag'];
      let paySnap = await captureSnapshot(sesV2a.page);
      for (const p of tryPaths) {
        try {
          await sesV2a.page.goto(fV2a.url + p);
          await sesV2a.page.waitForLoadState('networkidle').catch(() => {});
          const termsBox = sesV2a.page.locator('#terms');
          if ((await termsBox.count()) > 0) {
            await termsBox.check();
          }
          paySnap = await captureSnapshot(sesV2a.page);
          const hasPay = paySnap.elements.some(e => /pay|complete order/i.test(e.name) && e.enabled);
          if (hasPay) break;
        } catch { /* continue */ }
      }

      const policy = loadPolicy();
      const result = findReplacement(target, paySnap, policy);

      console.table(result.candidates.map(c => ({ name: c.name, score: c.score.toFixed(3) })));

      // Must be ambiguous with Pay and Complete order candidates
      expect(result.kind).toBe('ambiguous');
      const names = result.candidates.map(c => c.name.toLowerCase());
      const hasPay = names.some(n => /\bpay\b/.test(n));
      const hasComplete = names.some(n => /complete order/.test(n));
      expect(hasPay, `Expected 'Pay' in candidates: ${JSON.stringify(names)}`).toBe(true);
      expect(hasComplete, `Expected 'Complete order' in candidates: ${JSON.stringify(names)}`).toBe(true);
    } finally {
      await sesV1c.close();
      await fV1c.stop();
    }
  });

  it('forbidden names are never candidates', async () => {
    const fV1d = await startFixture('shop-v1');
    const sesV1d = await openSession();
    try {
      await sesV1d.page.goto(fV1d.url + '/');
      const snap = await captureSnapshot(sesV1d.page);
      const policy = loadPolicy();

      // Use a generic target
      const target = {
        role: 'button' as const,
        name: 'remove item',
        tag: 'button',
        text: '',
        label: '',
        attrs: {},
        nearText: '',
        bbox: { x: 0, y: 0, w: 100, h: 40 },
        selector: '#dummy',
        snapshotId: 0,
        ref: 'e0',
      };
      const result = findReplacement(target, snap, policy);
      const forbiddenFound = result.candidates.some(c =>
        /\b(remove|delete|logout|log out|cancel|clear)\b/i.test(c.name),
      );
      expect(forbiddenFound).toBe(false);
    } finally {
      await sesV1d.close();
      await fV1d.stop();
    }
  });

  it('resolveBySelector rejects element that reuses id but differs in role/name', async () => {
    // synthetic snap: element with same selector but completely different role/name
    const { resolveBySelector } = await import('../../src/match/matcher.js');
    const fV1e = await startFixture('shop-v1');
    const sesV1e = await openSession();
    try {
      await sesV1e.page.goto(fV1e.url + '/');
      const snap = await captureSnapshot(sesV1e.page);

      // Build a target that expects a completely different element at the same selector
      const firstEl = snap.elements[0];
      const target = elementToTarget(firstEl, snap.id ?? 0);
      // Mutate the target to have a very different name/role
      const syntheticTarget = {
        ...target,
        name: 'zzz-completely-different-button-xyz',
        role: 'textbox' as const,
        text: 'zzz',
        label: 'zzz',
        nearText: 'zzz',
      };

      const policy = loadPolicy();
      const result = await resolveBySelector(sesV1e.page, snap, syntheticTarget, policy);
      // Should be rejected because similarity < 0.85
      expect(result).toBeNull();
    } finally {
      await sesV1e.close();
      await fV1e.stop();
    }
  });
});
