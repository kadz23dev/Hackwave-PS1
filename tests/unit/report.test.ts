import { describe, it, expect } from 'vitest';
import { tempDb } from '../helpers/db.js';
import { severity } from '../../src/diff/severity.js';
import { buildChangeReport } from '../../src/diff/report.js';
import { explainChange } from '../../src/explain/templates.js';
import type { ChangeItem } from '../../src/types.js';

describe('Change Report, Severity & Explanation Templates', () => {
  it('[R-F1-06] change report has severity, classification, confidence and evidence items', () => {
    const items: ChangeItem[] = [
      {
        kind: 'ELEMENT_RENAMED',
        before: { name: 'Checkout', role: 'button', selector: '#checkout-button' },
        after: { name: 'Proceed to payment', role: 'button', selector: '.btn-primary' },
        evidence: "name 'Checkout'→'Proceed to payment'",
      },
      {
        kind: 'ATTR_CHANGED',
        before: { name: 'Checkout', role: 'button', selector: '#checkout-button' },
        after: { name: 'Proceed to payment', role: 'button', selector: '.btn-primary' },
        evidence: 'selector changed',
      },
    ];

    const report = buildChangeReport({
      baseSnapshotId: 1,
      headSnapshotId: 2,
      items,
      affectedSteps: ['s1', 's2'],
      classification: 'BREAKING_UI',
      confidence: 0.92,
      explanation: 'Checkout button renamed to Proceed to payment',
    });

    expect(report.severity).toBe('MEDIUM');
    expect(report.classification).toBe('BREAKING_UI');
    expect(report.confidence).toBe(0.92);
    expect(report.evidence).toHaveLength(2);
    expect(report.kind).toBe('ELEMENT_RENAMED');
    expect(report.affectedSteps).toEqual(['s1', 's2']);
    expect(report.explanation).toBe('Checkout button renamed to Proceed to payment');
  });

  it('[R-F3-03] change report is stored and read back identical', () => {
    const { repo } = tempDb();

    const site = repo.upsertSite('test-site', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101']);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });

    const items: ChangeItem[] = [
      {
        kind: 'ELEMENT_RENAMED',
        before: { name: 'Checkout', role: 'button', selector: '#checkout-button' },
        after: { name: 'Proceed to payment', role: 'button', selector: '.btn-primary' },
        evidence: "name 'Checkout'→'Proceed to payment'",
      },
      {
        kind: 'ATTR_CHANGED',
        before: { name: 'Checkout', role: 'button', selector: '#checkout-button' },
        after: { name: 'Proceed to payment', role: 'button', selector: '.btn-primary' },
        evidence: 'selector changed',
      },
    ];

    const builtReport = buildChangeReport({
      baseSnapshotId: s1,
      headSnapshotId: s2,
      items,
      affectedSteps: ['s3'],
      classification: 'BREAKING_UI',
      confidence: 0.95,
      explanation: 'Step s3 button was renamed',
    });

    const changeId = repo.insertChange(builtReport);
    expect(changeId).toBeGreaterThan(0);

    const changes = repo.listChanges({ limit: 1 });
    expect(changes).toHaveLength(1);
    const readBack = changes[0];

    // Assert deep equal on all fields except id and created_at
    expect(readBack.base_snapshot_id).toBe(builtReport.baseSnapshotId);
    expect(readBack.head_snapshot_id).toBe(builtReport.headSnapshotId);
    expect(readBack.kind).toBe(builtReport.kind);
    expect(readBack.severity).toBe(builtReport.severity);
    expect(readBack.classification).toBe(builtReport.classification);
    expect(readBack.confidence).toBe(builtReport.confidence);
    expect(readBack.evidence).toEqual(builtReport.evidence);
    expect(readBack.affectedSteps).toEqual(builtReport.affectedSteps);
    expect(readBack.explanation).toBe(builtReport.explanation);
  });

  it('severity is CRITICAL when an oracle failed regardless of items', () => {
    const layoutItems: ChangeItem[] = [
      {
        kind: 'LAYOUT_SHIFT',
        before: { name: 'Logo', role: 'img' },
        after: { name: 'Logo', role: 'img' },
        evidence: 'shifted 28px',
      },
    ];

    const sevWithOracleFail = severity(layoutItems, [], true, false);
    expect(sevWithOracleFail).toBe('CRITICAL');

    const sevWithAppError = severity(layoutItems, [], false, true);
    expect(sevWithAppError).toBe('CRITICAL');

    const sevNormal = severity(layoutItems, [], false, false);
    expect(sevNormal).toBe('LOW');
  });

  it('explanation template contains the old name, old selector and new name', () => {
    const step = {
      stepId: 's3',
      action: 'click',
      target: {
        name: 'Checkout',
        selector: '#checkout-button',
      },
    };

    const item: ChangeItem = {
      kind: 'ELEMENT_RENAMED',
      before: { name: 'Checkout', selector: '#checkout-button' },
      after: { name: 'Place order', snapshotElementId: 'e_88' },
      evidence: "name 'Checkout'→'Place order', id removed",
    };

    const match = {
      role: 'button',
      name: 'Place order',
      ref: 'e_88',
      score: 0.91,
    };

    const explanation = explainChange(
      step,
      item,
      match,
      'Complete checkout with a valid card',
      ['order-created', 'no-server-errors']
    );

    expect(explanation).toContain("Step s3 (click 'Checkout' via #checkout-button) no longer matches: name 'Checkout'→'Place order', id removed.");
    expect(explanation).toContain('Checkout');
    expect(explanation).toContain('#checkout-button');
    expect(explanation).toContain('Place order');
    expect(explanation).toContain('0.91');
    expect(explanation).toContain('order-created, no-server-errors');
  });
});
