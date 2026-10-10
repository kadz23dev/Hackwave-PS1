import { describe, it, expect } from 'vitest';
import { similarity } from '../../src/match/score.js';
import type { TargetFingerprint, ElementRecord } from '../../src/types.js';

function makeTarget(overrides: Partial<TargetFingerprint> = {}): TargetFingerprint {
  return {
    role: 'button',
    name: 'Add to cart',
    tag: 'button',
    text: 'Add to cart',
    label: '',
    attrs: { id: 'add-GZ-MINI' },
    nearText: 'Gizmo Mini',
    bbox: { x: 100, y: 200, w: 120, h: 40 },
    selector: '#add-GZ-MINI',
    snapshotId: 1,
    ref: 'e3',
    ...overrides,
  };
}

function makeElement(overrides: Partial<ElementRecord> = {}): ElementRecord {
  return {
    ref: 'e4',
    role: 'button',
    name: 'Add to bag',
    tag: 'button',
    text: 'Add to bag',
    label: '',
    attrs: {},
    nearText: 'Gizmo Mini',
    bbox: { x: 105, y: 205, w: 120, h: 40 },
    visible: true,
    enabled: true,
    empty: false,
    checked: null,
    selector: '#add-bag-GZ-MINI',
    ...overrides,
  };
}

describe('score.ts — similarity', () => {
  it('add to cart vs add to bag with same nearText scores > 0.6', () => {
    const t = makeTarget();
    const e = makeElement();
    const s = similarity(t, e);
    expect(s).toBeGreaterThan(0.6);
  });

  it('same name+role+bbox scores very high (>= 0.9)', () => {
    // When name, role, bbox all match perfectly, score should be well above 0.9.
    // label/nearText/attrs are empty on both sides so those terms contribute
    // equally (0 vs 0 → tokenSetRatio returns 0, cancels out).
    // posSim = 1 (same center), roleSim = 1, nameSim = 1 → min score = 0.35+0.20+0.10 = 0.65
    // With text also matching: 0.35+0.20+0.10+0.10 = 0.75 at minimum.
    const bbox = { x: 0, y: 0, w: 100, h: 40 };
    const t = makeTarget({ name: 'Checkout', text: 'Checkout', label: 'Checkout', attrs: {}, nearText: '', bbox });
    const e = makeElement({ name: 'Checkout', text: 'Checkout', label: 'Checkout', attrs: {}, nearText: '', bbox });
    const s = similarity(t, e);
    expect(s).toBeGreaterThanOrEqual(0.75);
  });

  it('different roles with non-clickable roles score lower on roleSim', () => {
    const t = makeTarget({ role: 'textbox' });
    const e = makeElement({ role: 'button' });
    const s = similarity(t, e);
    // roleSim = 0, so score capped
    expect(s).toBeLessThan(0.8);
  });

  it('attrSim exact id match contributes positively', () => {
    const t = makeTarget({ attrs: { id: 'my-btn' }, nearText: '' });
    const eMatch = makeElement({ attrs: { id: 'my-btn' }, nearText: '' });
    const eNoMatch = makeElement({ attrs: {}, nearText: '' });
    expect(similarity(t, eMatch)).toBeGreaterThan(similarity(t, eNoMatch));
  });
});
