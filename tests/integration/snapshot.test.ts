import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { openSession, type Session } from '../../src/browser/session.js';
import { captureSnapshot } from '../../src/snapshot/capture.js';

describe('Browser Session & Snapshotter Integration', () => {
  let fixtureV1: { url: string; stop(): Promise<void> };
  let fixtureV2: { url: string; stop(): Promise<void> };
  let session: Session;

  beforeAll(async () => {
    fixtureV1 = await startFixture('shop-v1');
    fixtureV2 = await startFixture('shop-v2');
    session = await openSession({ headless: true });
  });

  afterAll(async () => {
    if (session) await session.close();
    if (fixtureV1) await fixtureV1.stop();
    if (fixtureV2) await fixtureV2.stop();
  });

  it("[R-F1-01] captures a baseline snapshot of v1 /cart including button 'Checkout' with selector #checkout-button", async () => {
    await fetch(`${fixtureV1.url}/api/cart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku: 'GZ-MINI' }),
    });

    await session.page.goto(`${fixtureV1.url}/cart`);
    await session.page.waitForLoadState('networkidle');

    const snap = await captureSnapshot(session.page, { screenshot: false });
    const checkoutBtn = snap.elements.find(e => e.role === 'button' && e.name === 'Checkout');

    expect(checkoutBtn).toBeDefined();
    expect(checkoutBtn?.selector).toBe('#checkout-button');
    expect(snap.headings).toContain('Your cart');
  });

  it("captures v2 /bag with a button named 'Proceed to payment' and nearText 'Your bag'", async () => {
    await session.page.goto(`${fixtureV2.url}/bag`);
    await session.page.waitForLoadState('networkidle');

    const snap = await captureSnapshot(session.page, { screenshot: false });
    const proceedBtn = snap.elements.find(e => e.role === 'button' && e.name === 'Proceed to payment');

    expect(proceedBtn).toBeDefined();
    expect(proceedBtn?.nearText).toBe('Your bag');
  });

  it("nearText of 'Add to cart' under Gizmo Mini is 'Gizmo Mini'", async () => {
    await session.page.goto(`${fixtureV1.url}/`);
    await session.page.waitForLoadState('networkidle');

    const snap = await captureSnapshot(session.page, { screenshot: false });
    const addMini = snap.elements.find(
      e => e.role === 'button' && e.name === 'Add to cart' && e.attrs.id === 'add-GZ-MINI'
    );

    expect(addMini).toBeDefined();
    expect(addMini?.nearText).toBe('Gizmo Mini');
  });

  it('two captures of the same page produce identical elements JSON and contentHash', async () => {
    await session.page.goto(`${fixtureV1.url}/`);
    await session.page.waitForLoadState('networkidle');

    const snap1 = await captureSnapshot(session.page, { screenshot: false });
    const snap2 = await captureSnapshot(session.page, { screenshot: false });

    expect(JSON.stringify(snap1.elements)).toBe(JSON.stringify(snap2.elements));
    expect(snap1.contentHash).toBe(snap2.contentHash);
  });

  it('[R-F3-02] snapshot with screenshot is stored once per content_hash', async () => {
    const { db, repo } = tempDb();
    const site = repo.upsertSite('shop-v1', fixtureV1.url, [fixtureV1.url]);
    const page = repo.upsertPage(site.id, '/cart');

    await session.page.goto(`${fixtureV1.url}/cart`);
    await session.page.waitForLoadState('networkidle');

    const snap1 = await captureSnapshot(session.page, { screenshot: true });
    expect(snap1.screenshotPath).toBeTruthy();

    const id1 = repo.insertSnapshot(page.id, 'v1', snap1);
    expect(id1).toBeGreaterThan(0);

    const snap2 = await captureSnapshot(session.page, { screenshot: true });
    const id2 = repo.insertSnapshot(page.id, 'v1-dup', snap2);

    expect(id2).toBe(id1);

    const count = (db.prepare('SELECT COUNT(*) as c FROM snapshots WHERE page_id = ?').get(page.id) as { c: number }).c;
    expect(count).toBe(1);
  });
});
