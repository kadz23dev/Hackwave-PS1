import { describe, it, expect } from 'vitest';
import { contentHash, normalizeName } from '../../src/snapshot/hash.js';
import type { ElementRecord } from '../../src/types.js';

describe('Snapshot Content Hash', () => {
  it('contentHash ignores cart count digits', () => {
    const el1: ElementRecord = {
      ref: 'e1',
      role: 'link',
      name: 'Cart (1)',
      tag: 'a',
      text: 'Cart (1)',
      label: '',
      attrs: { id: 'cart-link', href: '/cart' },
      nearText: 'Gizmo Shop',
      bbox: { x: 100, y: 20, w: 60, h: 25 },
      visible: true,
      enabled: true,
      empty: false,
      checked: null,
      selector: '#cart-link',
    };

    const el2: ElementRecord = {
      ...el1,
      name: 'Cart (2)',
      text: 'Cart (2)',
    };

    const hash1 = contentHash([el1]);
    const hash2 = contentHash([el2]);

    expect(hash1).toBe(hash2);
  });

  it('normalizes names and ignores bounding box changes', () => {
    expect(normalizeName('  Cart (123) items  ')).toBe('cart (#) items');

    const elBase: ElementRecord = {
      ref: 'e1',
      role: 'button',
      name: 'Checkout',
      tag: 'button',
      text: 'Checkout',
      label: '',
      attrs: { id: 'checkout-button' },
      nearText: '',
      bbox: { x: 10, y: 10, w: 100, h: 40 },
      visible: true,
      enabled: true,
      empty: false,
      checked: null,
      selector: '#checkout-button',
    };

    const elMoved: ElementRecord = {
      ...elBase,
      bbox: { x: 500, y: 800, w: 120, h: 50 },
    };

    expect(contentHash([elBase])).toBe(contentHash([elMoved]));
  });
});
