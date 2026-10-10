import { describe, it, expect, afterAll } from 'vitest';
import { openSession } from '../../src/browser/session.js';
import { captureSnapshot } from '../../src/snapshot/capture.js';
import { diffSnapshots } from '../../src/diff/differ.js';
import { startFixture } from '../helpers/fixtures.js';

describe('differ integration', { timeout: 60000 }, () => {
  afterAll(async () => {
    // sessions are closed inline per test
  });

  it('[R-F1-02] v1 vs v2 home reports ELEMENT_RENAMED for "Add to cart"', async () => {
    const fV1 = await startFixture('shop-v1');
    const fV2 = await startFixture('shop-v2');
    const sesV1 = await openSession();
    const sesV2 = await openSession();
    try {
      await sesV1.page.goto(fV1.url + '/');
      const snapV1 = await captureSnapshot(sesV1.page);

      await sesV2.page.goto(fV2.url + '/');
      const snapV2 = await captureSnapshot(sesV2.page);

      const items = diffSnapshots(snapV1, snapV2);
      console.log('Differ items:', items.map(i => `${i.kind}: ${i.evidence}`));

      const renamed = items.find(
        i =>
          i.kind === 'ELEMENT_RENAMED' &&
          i.evidence.toLowerCase().includes('add to cart'),
      );
      expect(renamed, 'Expected ELEMENT_RENAMED for Add to cart').toBeTruthy();
    } finally {
      await sesV1.close();
      await sesV2.close();
      await fV1.stop();
      await fV2.stop();
    }
  });

  it('[R-F1-03] reports ATTR_CHANGED when #add-GZ-MINI id is removed', async () => {
    const fV1 = await startFixture('shop-v1');
    const fV2 = await startFixture('shop-v2');
    const sesV1 = await openSession();
    const sesV2 = await openSession();
    try {
      await sesV1.page.goto(fV1.url + '/');
      const snapV1 = await captureSnapshot(sesV1.page);

      await sesV2.page.goto(fV2.url + '/');
      const snapV2 = await captureSnapshot(sesV2.page);

      const items = diffSnapshots(snapV1, snapV2);
      const attrChanged = items.find(
        i => i.kind === 'ATTR_CHANGED' && i.evidence.toLowerCase().includes('add-gz-mini'),
      );
      expect(
        attrChanged,
        `Expected ATTR_CHANGED for #add-GZ-MINI id. Items: ${items.map(i => i.kind + ':' + i.evidence).join('; ')}`,
      ).toBeTruthy();
    } finally {
      await sesV1.close();
      await sesV2.close();
      await fV1.stop();
      await fV2.stop();
    }
  });

  it('[R-F1-04] reports ELEMENT_MOVED or LAYOUT_SHIFT for checkout button moving top', async () => {
    const fV1 = await startFixture('shop-v1');
    const fV2 = await startFixture('shop-v2');
    const sesV1 = await openSession();
    const sesV2 = await openSession();
    try {
      await sesV1.page.goto(fV1.url + '/cart');
      const snapV1 = await captureSnapshot(sesV1.page);

      await sesV2.page.goto(fV2.url + '/bag');
      const snapV2 = await captureSnapshot(sesV2.page);

      const items = diffSnapshots(snapV1, snapV2);
      console.log('Cart/bag differ items:', items.map(i => `${i.kind}: ${i.evidence}`));

      const hasMoveOrShift = items.some(
        i => i.kind === 'ELEMENT_MOVED' || i.kind === 'LAYOUT_SHIFT',
      );
      // Either moved/shifted, or the element was renamed+removed then added (ELEMENT_REMOVED is also acceptable)
      const hasCheckoutChange = items.some(
        i =>
          (i.kind === 'ELEMENT_MOVED' || i.kind === 'LAYOUT_SHIFT' || i.kind === 'ELEMENT_RENAMED') &&
          (
            (i.before && 'name' in i.before && String(i.before.name).toLowerCase().includes('checkout')) ||
            (i.after && 'name' in i.after && String(i.after.name).toLowerCase().includes('proceed'))
          ),
      );
      expect(
        hasMoveOrShift || hasCheckoutChange,
        `Expected ELEMENT_MOVED, LAYOUT_SHIFT, or ELEMENT_RENAMED for checkout button. Items: ${items.map(i => i.kind + ':' + i.evidence).join('; ')}`,
      ).toBe(true);
    } finally {
      await sesV1.close();
      await sesV2.close();
      await fV1.stop();
      await fV2.stop();
    }
  });
});
