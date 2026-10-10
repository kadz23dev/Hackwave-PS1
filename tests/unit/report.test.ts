import { describe, it, expect } from 'vitest';
import { severity } from '../../src/diff/severity.js';
import { buildChangeReport } from '../../src/diff/report.js';
import { explainChange } from '../../src/explain/templates.js';
import { tempDb } from '../helpers/db.js';
import type { ChangeItem } from '../../src/types.js';

describe('Change report + severity unit tests — T06', () => {
  it('[R-F1-06] change report has severity, classification, confidence and evidence items', () => {
    const items: ChangeItem[] = [
      {
        kind: 'ELEMENT_RENAMED',
        before: { name: 'Checkout', role: 'button' },
        after: { name: 'Proceed to payment', role: 'button' },
        evidence: "name 'Checkout'→'Proceed to payment'",
      },
      {
        kind: 'ATTR_CHANGED',
        before: { attrs: { id: 'checkout-button' } },
        after: { attrs: {} },
        evidence: "id 'checkout-button' removed",
      },
    ];

    const report = buildChangeReport({
      base: { id: 1 },
      head: { id: 2 },
      items,
      affectedSteps: ['s1', 's2'],
      classification: 'HARMLESS_UI',
      confidence: 0.88,
      explanation: 'Button was renamed and id removed',
    });

    expect(report.baseSnapshotId).toBe(1);
    expect(report.headSnapshotId).toBe(2);
    expect(report.kind).toBe('ELEMENT_RENAMED');
    expect(report.severity).toBe('MEDIUM');
    expect(report.classification).toBe('HARMLESS_UI');
    expect(report.confidence).toBe(0.88);
    expect(report.evidence).toHaveLength(2);
    expect(report.evidence[0].kind).toBe('ELEMENT_RENAMED');
    expect(report.affectedSteps).toEqual(['s1', 's2']);
    expect(report.explanation).toBe('Button was renamed and id removed');
  });

  it('[R-F3-03] change report is stored and read back identical', () => {
    const { repo } = tempDb();
    const site = repo.upsertSite('shop', 'http://localhost:4101', []);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });

    const items: ChangeItem[] = [
      {
        kind: 'ELEMENT_RENAMED',
        before: { name: 'Add to cart', role: 'button' },
        after: { name: 'Add to bag', role: 'button' },
        evidence: "name 'Add to cart'→'Add to bag'",
      },
    ];

    const built = buildChangeReport({
      base: s1,
      head: s2,
      items,
      affectedSteps: ['s1'],
      classification: 'HARMLESS_UI',
      confidence: 0.95,
      explanation: 'Step s1 Add to cart was renamed to Add to bag',
    });

    const changeId = repo.insertChange({
      baseSnapshotId: built.baseSnapshotId,
      headSnapshotId: built.headSnapshotId,
      kind: built.kind,
      severity: built.severity,
      classification: built.classification,
      confidence: built.confidence,
      evidence: built.evidence,
      affectedSteps: built.affectedSteps,
      explanation: built.explanation,
    });

    expect(changeId).toBeGreaterThan(0);

    const stored = repo.getChange(changeId);
    expect(stored).not.toBeNull();

    expect(stored!.base_snapshot_id).toBe(built.baseSnapshotId);
    expect(stored!.head_snapshot_id).toBe(built.headSnapshotId);
    expect(stored!.kind).toBe(built.kind);
    expect(stored!.severity).toBe(built.severity);
    expect(stored!.classification).toBe(built.classification);
    expect(stored!.confidence).toBe(built.confidence);
    expect(stored!.explanation).toBe(built.explanation);
    expect(stored!.evidence).toEqual(built.evidence);
    expect(stored!.affectedSteps).toEqual(built.affectedSteps);
  });

  it('severity is CRITICAL when an oracle failed regardless of items', () => {
    const shiftOnly: ChangeItem[] = [
      {
        kind: 'LAYOUT_SHIFT',
        before: { bbox: { x: 0, y: 0, w: 10, h: 10 } },
        after: { bbox: { x: 30, y: 0, w: 10, h: 10 } },
        evidence: 'shifted 30px',
      },
    ];

    // Even with only LAYOUT_SHIFT, if oracleFailed=true → CRITICAL
    const sevOracle = severity(shiftOnly, [], true, false);
    expect(sevOracle).toBe('CRITICAL');

    // If appError=true → CRITICAL
    const sevApp = severity(shiftOnly, [], false, true);
    expect(sevApp).toBe('CRITICAL');

    // If neither → LOW
    const sevNormal = severity(shiftOnly, [], false, false);
    expect(sevNormal).toBe('LOW');
  });

  it('explanation template contains the old name, old selector and new name', () => {
    const step = {
      stepId: 's1',
      action: 'click',
      target: { name: 'Add to cart', selector: '#add-cart' },
    };
    const item: ChangeItem = {
      kind: 'ELEMENT_RENAMED',
      before: { name: 'Add to cart' },
      after: { name: 'Add to bag' },
      evidence: "name 'Add to cart'→'Add to bag'",
    };
    const match = {
      best: {
        role: 'button',
        name: 'Add to bag',
        ref: 'e4',
        score: 0.79,
      },
    };
    const goal = 'Complete checkout with a valid credit card';
    const oracleIds = ['order-created', 'no-server-errors'];

    const text = explainChange(step, item, match, goal, oracleIds);

    expect(text).toContain('Add to cart');
    expect(text).toContain('#add-cart');
    expect(text).toContain('Add to bag');
    expect(text).toContain('0.79');
    expect(text).toContain('e4');
    expect(text).toContain('order-created, no-server-errors');
  });
});
