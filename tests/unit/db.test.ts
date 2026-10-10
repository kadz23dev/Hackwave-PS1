import { describe, it, expect } from 'vitest';
import { tempDb } from '../helpers/db.js';

describe('SQLite Database & Repo Layer', () => {
  it('[R-F3-01] persists site and page versions', () => {
    const { db, repo } = tempDb();

    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101', 'http://127.0.0.1:4102']);
    expect(site.id).toBeGreaterThan(0);

    const siteRow = db.prepare('SELECT id, name, base_url, allowlist_json FROM sites WHERE id = ?').get(site.id) as {
      id: number;
      name: string;
      base_url: string;
      allowlist_json: string;
    };
    expect(siteRow.name).toBe('gizmo');
    expect(siteRow.base_url).toBe('http://127.0.0.1:4101');
    const allowlist = JSON.parse(siteRow.allowlist_json);
    expect(allowlist).toEqual(['http://127.0.0.1:4101', 'http://127.0.0.1:4102']);

    const page1 = repo.upsertPage(site.id, '/');
    const page2 = repo.upsertPage(site.id, '/cart');
    expect(page1.id).toBeGreaterThan(0);
    expect(page2.id).toBeGreaterThan(0);

    const pageRows = db.prepare('SELECT id, path FROM pages WHERE site_id = ? ORDER BY id ASC').all(site.id) as Array<{
      id: number;
      path: string;
    }>;
    expect(pageRows).toHaveLength(2);
    expect(pageRows[0].path).toBe('/');
    expect(pageRows[1].path).toBe('/cart');

    const duplicatePage = repo.upsertPage(site.id, '/');
    expect(duplicatePage.id).toBe(page1.id);
    const countAfter = db.prepare('SELECT COUNT(*) as c FROM pages WHERE site_id = ?').get(site.id) as { c: number };
    expect(countAfter.c).toBe(2);
  });

  it('[R-F3-02] persists a snapshot and dedups identical content_hash', () => {
    const { db, repo } = tempDb();
    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const page = repo.upsertPage(site.id, '/cart');

    const snap1 = {
      contentHash: 'hash_abc123',
      elements: [{ role: 'button', name: 'Checkout' }],
      ariaYaml: '- button "Checkout"',
      screenshotPath: '/screenshots/1.png'
    };

    const snapId1 = repo.insertSnapshot(page.id, 'v1', snap1);
    expect(snapId1).toBeGreaterThan(0);

    const row1 = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapId1) as {
      page_id: number;
      version_label: string;
      content_hash: string;
    };
    expect(row1.page_id).toBe(page.id);
    expect(row1.version_label).toBe('v1');
    expect(row1.content_hash).toBe('hash_abc123');

    const snap2 = {
      contentHash: 'hash_abc123',
      elements: [{ role: 'button', name: 'Checkout' }],
      ariaYaml: '- button "Checkout"',
      screenshotPath: '/screenshots/2.png'
    };

    const snapId2 = repo.insertSnapshot(page.id, 'v1-duplicate', snap2);
    expect(snapId2).toBe(snapId1);

    const snapCount = db.prepare('SELECT COUNT(*) as c FROM snapshots WHERE page_id = ?').get(page.id) as { c: number };
    expect(snapCount.c).toBe(1);

    const dedupAudit = db.prepare("SELECT * FROM audit_log WHERE action = 'snapshot.dedup'").all() as Array<{
      entity_id: number;
    }>;
    expect(dedupAudit.length).toBeGreaterThanOrEqual(1);
    expect(dedupAudit[0].entity_id).toBe(snapId1);
  });

  it('[R-F3-03] persists a change with classification and severity', () => {
    const { db, repo } = tempDb();
    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });

    const changeId = repo.insertChange({
      baseSnapshotId: s1,
      headSnapshotId: s2,
      kind: 'ELEMENT_RENAMED',
      severity: 'HIGH',
      classification: 'BREAKING_UI',
      confidence: 0.94,
      evidence: [{ type: 'dom_diff', evidence: 'name Checkout -> Place order' }],
      affectedSteps: ['s3'],
      explanation: 'Checkout button renamed to Place order'
    });
    expect(changeId).toBeGreaterThan(0);

    const row = db.prepare('SELECT * FROM changes WHERE id = ?').get(changeId) as {
      base_snapshot_id: number;
      head_snapshot_id: number;
      kind: string;
      severity: string;
      classification: string;
      confidence: number;
      explanation: string;
      evidence_json: string;
      affected_steps_json: string;
    };
    expect(row.base_snapshot_id).toBe(s1);
    expect(row.head_snapshot_id).toBe(s2);
    expect(row.kind).toBe('ELEMENT_RENAMED');
    expect(row.severity).toBe('HIGH');
    expect(row.classification).toBe('BREAKING_UI');
    expect(row.confidence).toBe(0.94);
    expect(row.explanation).toBe('Checkout button renamed to Place order');

    const evidence = JSON.parse(row.evidence_json);
    expect(evidence[0].evidence).toBe('name Checkout -> Place order');
    const steps = JSON.parse(row.affected_steps_json);
    expect(steps).toEqual(['s3']);
  });

  it('[R-F3-04] persists proposed and applied repairs', () => {
    const { db, repo } = tempDb();
    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });
    const changeId = repo.insertChange({
      baseSnapshotId: s1,
      headSnapshotId: s2,
      kind: 'ELEMENT_RENAMED',
      severity: 'HIGH',
      classification: 'BREAKING_UI',
      confidence: 0.9,
      evidence: [],
      affectedSteps: ['s1'],
      explanation: 'renamed'
    });

    const repairId = repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: { steps: [{ stepId: 's1', targetRef: 'e2' }] },
      status: 'proposed',
      explanation: 'use e2'
    });
    expect(repairId).toBeGreaterThan(0);

    const row = db.prepare('SELECT * FROM repairs WHERE id = ?').get(repairId) as {
      status: string;
      proposer: string;
      change_id: number;
    };
    expect(row.status).toBe('proposed');
    expect(row.proposer).toBe('heuristic');
    expect(row.change_id).toBe(changeId);

    const intent = repo.upsertIntentVersion('checkout', 'sha-intent-1', 'body');
    const runId = repo.insertRun({ intentId: intent.id, intentSha: 'sha-intent-1' });
    repo.insertValidationRun(repairId, runId, 'PASS', { ok: true });

    const updated = repo.setRepairStatus(repairId, 'applied', 'tester', 'approved by qa');
    expect(updated).toBe(true);

    const updatedRow = db.prepare('SELECT status FROM repairs WHERE id = ?').get(repairId) as { status: string };
    expect(updatedRow.status).toBe('applied');
  });

  it('[R-F3-05] persists approval and rejection records', () => {
    const { db, repo } = tempDb();
    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });
    const changeId = repo.insertChange({
      baseSnapshotId: s1,
      headSnapshotId: s2,
      kind: 'ELEMENT_RENAMED',
      severity: 'HIGH',
      classification: 'BREAKING_UI',
      confidence: 0.9,
      evidence: [],
      affectedSteps: [],
      explanation: ''
    });
    const repairId = repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: {},
      status: 'proposed'
    });

    const app1 = repo.insertApproval(repairId, 'approve', 'lead-architect', 'validated against contract');
    const app2 = repo.insertApproval(repairId, 'reject', 'qa-reviewer', 'unwanted mutation');
    expect(app1).toBeGreaterThan(0);
    expect(app2).toBeGreaterThan(0);

    const rows = db.prepare('SELECT * FROM approvals WHERE repair_id = ? ORDER BY id ASC').all(repairId) as Array<{
      decision: string;
      actor: string;
      reason: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].decision).toBe('approve');
    expect(rows[0].actor).toBe('lead-architect');
    expect(rows[0].reason).toBe('validated against contract');
    expect(rows[1].decision).toBe('reject');
    expect(rows[1].actor).toBe('qa-reviewer');
  });

  it('[R-F3-06] persists verdicts, oracle results and known_good rollback references', () => {
    const { db, repo } = tempDb();
    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });
    const intent = repo.upsertIntentVersion('checkout', 'sha-intent-1', 'body');
    const runId = repo.insertRun({ intentId: intent.id, intentSha: 'sha-intent-1' });

    repo.finishRun(runId, {
      verdict: 'HEALED_PASS',
      explanation: 'Healed step s1',
      llmCalls: 0,
      evidence: { orderId: 'ord_123' }
    });

    const runRow = db.prepare('SELECT verdict, explanation, llm_calls, evidence_json FROM runs WHERE id = ?').get(runId) as {
      verdict: string;
      explanation: string;
      llm_calls: number;
      evidence_json: string;
    };
    expect(runRow.verdict).toBe('HEALED_PASS');
    expect(runRow.explanation).toBe('Healed step s1');
    expect(runRow.llm_calls).toBe(0);
    expect(JSON.parse(runRow.evidence_json)).toEqual({ orderId: 'ord_123' });

    const changeId = repo.insertChange({
      baseSnapshotId: s1,
      headSnapshotId: s2,
      kind: 'ELEMENT_RENAMED',
      severity: 'HIGH',
      classification: 'BREAKING_UI',
      confidence: 0.9,
      evidence: [],
      affectedSteps: [],
      explanation: ''
    });
    const plan1 = repo.insertStepPlan({ intentId: intent.id, siteId: site.id, steps: ['s1'], origin: 'baseline', startHash: 'h1' });
    const plan2 = repo.insertStepPlan({ intentId: intent.id, siteId: site.id, steps: ['s1-healed'], origin: 'repair', startHash: 'h2' });
    const repairId = repo.insertRepair({ changeId, proposer: 'heuristic', proposal: {}, status: 'proposed', stepPlanId: plan2 });

    const valRunId = repo.insertValidationRun(repairId, runId, 'HEALED_PASS', { status: 'all ok' });
    repo.insertOracleResults(valRunId, [
      { oracle: 'order-created', ok: true, detail: { totalCents: 1999 } },
      { oracle: 'no-server-errors', ok: true, detail: {} }
    ]);

    const oracleRows = db.prepare('SELECT oracle, ok, detail_json FROM oracle_results WHERE validation_run_id = ? ORDER BY id ASC').all(valRunId) as Array<{
      oracle: string;
      ok: number;
      detail_json: string;
    }>;
    expect(oracleRows).toHaveLength(2);
    expect(oracleRows[0].oracle).toBe('order-created');
    expect(oracleRows[0].ok).toBe(1);
    expect(JSON.parse(oracleRows[0].detail_json)).toEqual({ totalCents: 1999 });

    repo.insertKnownGood(page.id, s1, null, plan1);
    repo.insertKnownGood(page.id, s2, repairId, plan2);
    const kgBeforeRollback = repo.currentKnownGood(intent.id, site.id);
    expect(kgBeforeRollback?.snapshot_id).toBe(s2);

    repo.insertApproval(repairId, 'rollback', 'release-lead', 'reverting to plan 1');
    repo.insertKnownGood(page.id, s1, null, plan1);
    const kgAfterRollback = repo.currentKnownGood(intent.id, site.id);
    expect(kgAfterRollback?.snapshot_id).toBe(s1);

    const allKg = db.prepare('SELECT snapshot_id FROM known_good WHERE page_id = ? ORDER BY id ASC').all(page.id) as Array<{
      snapshot_id: number;
    }>;
    expect(allKg).toHaveLength(3);
    expect(allKg[0].snapshot_id).toBe(s1);
    expect(allKg[1].snapshot_id).toBe(s2);
    expect(allKg[2].snapshot_id).toBe(s1);
  });

  it('[R-F3-07] a repair row requires change_id (FK) and links to its validation run', () => {
    const { db, repo } = tempDb();

    expect(() => {
      repo.insertRepair({
        changeId: 999999,
        proposer: 'heuristic',
        proposal: {}
      });
    }).toThrow(/FOREIGN KEY|constraint/i);

    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });
    const changeId = repo.insertChange({
      baseSnapshotId: s1,
      headSnapshotId: s2,
      kind: 'ELEMENT_RENAMED',
      severity: 'HIGH',
      classification: 'BREAKING_UI',
      confidence: 0.9,
      evidence: [],
      affectedSteps: [],
      explanation: ''
    });

    const repairId = repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: {}
    });
    expect(repairId).toBeGreaterThan(0);

    const intent = repo.upsertIntentVersion('checkout', 'sha-intent-1', 'body');
    const runId = repo.insertRun({ intentId: intent.id, intentSha: 'sha-intent-1' });
    const valRunId = repo.insertValidationRun(repairId, runId, 'PASS', { checked: true });

    const valRow = db.prepare('SELECT id, repair_id, run_id, verdict FROM validation_runs WHERE id = ?').get(valRunId) as {
      id: number;
      repair_id: number;
      run_id: number;
      verdict: string;
    };
    expect(valRow.repair_id).toBe(repairId);
    expect(valRow.run_id).toBe(runId);
    expect(valRow.verdict).toBe('PASS');
  });

  it('[R-F4-07] UPDATE and DELETE on audit_log abort', () => {
    const { db, repo } = tempDb();
    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });
    const changeId = repo.insertChange({
      baseSnapshotId: s1,
      headSnapshotId: s2,
      kind: 'ELEMENT_RENAMED',
      severity: 'HIGH',
      classification: 'BREAKING_UI',
      confidence: 0.9,
      evidence: [],
      affectedSteps: [],
      explanation: ''
    });
    const intent = repo.upsertIntentVersion('checkout', 'sha-intent-1', 'body');
    const planId = repo.insertStepPlan({ intentId: intent.id, siteId: site.id, steps: ['s1'], origin: 'baseline', startHash: 'h1' });
    const repairId = repo.insertRepair({ changeId, proposer: 'heuristic', proposal: {}, stepPlanId: planId });
    const runId = repo.insertRun({ intentId: intent.id, intentSha: 'sha-intent-1' });
    const valRunId = repo.insertValidationRun(repairId, runId, 'PASS', {});
    repo.insertOracleResults(valRunId, [{ oracle: 'o1', ok: true, detail: {} }]);
    repo.insertApproval(repairId, 'approve', 'auditor', 'ok');

    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE audit_log SET actor = 'attacker' WHERE id = 1").run()).toThrow(/append-only/);

    expect(() => db.prepare('DELETE FROM approvals').run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE approvals SET actor = 'attacker' WHERE id = 1").run()).toThrow(/append-only/);

    expect(() => db.prepare('DELETE FROM validation_runs').run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE validation_runs SET verdict = 'FAIL' WHERE id = 1").run()).toThrow(/append-only/);

    expect(() => db.prepare('DELETE FROM oracle_results').run()).toThrow(/append-only/);
    expect(() => db.prepare('UPDATE oracle_results SET ok = 0 WHERE id = 1').run()).toThrow(/append-only/);

    expect(() => db.prepare('DELETE FROM step_plans').run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE step_plans SET steps_json = '[]' WHERE id = 1").run()).toThrow(/append-only/);

    const auditCount = (db.prepare('SELECT COUNT(*) as c FROM audit_log').get() as { c: number }).c;
    expect(auditCount).toBeGreaterThan(0);
  });

  it('[R-F4-04] repair cannot become validated without a passing validation_run', () => {
    const { db, repo } = tempDb();
    const site = repo.upsertSite('gizmo', 'http://127.0.0.1:4101', []);
    const page = repo.upsertPage(site.id, '/cart');
    const s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'h1', elements: [] });
    const s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'h2', elements: [] });
    const changeId = repo.insertChange({
      baseSnapshotId: s1,
      headSnapshotId: s2,
      kind: 'ELEMENT_RENAMED',
      severity: 'HIGH',
      classification: 'BREAKING_UI',
      confidence: 0.9,
      evidence: [],
      affectedSteps: [],
      explanation: ''
    });
    expect(() => repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: {},
      status: 'validated'
    })).toThrow(/requires/);

    const repairId = repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: {},
      status: 'proposed'
    });

    expect(() => repo.setRepairStatus(repairId, 'validated', 'tester')).toThrow(/requires/);
    expect(() => repo.setRepairStatus(repairId, 'approved', 'tester')).toThrow(/requires/);
    expect(() => repo.setRepairStatus(repairId, 'applied', 'tester')).toThrow(/requires/);

    const initialStatus = (db.prepare('SELECT status FROM repairs WHERE id = ?').get(repairId) as { status: string }).status;
    expect(initialStatus).toBe('proposed');

    const intent = repo.upsertIntentVersion('checkout', 'sha-intent-1', 'body');
    const runId1 = repo.insertRun({ intentId: intent.id, intentSha: 'sha-intent-1' });
    repo.insertValidationRun(repairId, runId1, 'FAIL', {});

    expect(() => repo.setRepairStatus(repairId, 'validated', 'tester')).toThrow(/requires/);

    const runId2 = repo.insertRun({ intentId: intent.id, intentSha: 'sha-intent-1' });
    repo.insertValidationRun(repairId, runId2, 'PASS', {});

    expect(repo.setRepairStatus(repairId, 'validated', 'tester')).toBe(true);
    const validatedStatus = (db.prepare('SELECT status FROM repairs WHERE id = ?').get(repairId) as { status: string }).status;
    expect(validatedStatus).toBe('validated');

    expect(repo.setRepairStatus(repairId, 'approved', 'lead', 'looks good')).toBe(true);
    const approvedStatus = (db.prepare('SELECT status FROM repairs WHERE id = ?').get(repairId) as { status: string }).status;
    expect(approvedStatus).toBe('approved');

    expect(repo.setRepairStatus(repairId, 'applied', 'lead', 'applying repair')).toBe(true);
    const appliedStatus = (db.prepare('SELECT status FROM repairs WHERE id = ?').get(repairId) as { status: string }).status;
    expect(appliedStatus).toBe('applied');
  });

  it('every repo write inserts exactly one audit_log row', () => {
    const { db, repo } = tempDb();

    function checkSingleAuditWrite(actionDescription: string, fn: () => void) {
      const before = (db.prepare('SELECT COUNT(*) as c FROM audit_log').get() as { c: number }).c;
      fn();
      const after = (db.prepare('SELECT COUNT(*) as c FROM audit_log').get() as { c: number }).c;
      expect(after - before, `Write operation '${actionDescription}' must add exactly 1 audit row`).toBe(1);

      const lastAudit = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').get() as {
        actor: string;
        action: string;
        entity: string;
        payload_json: string;
      };
      expect(lastAudit.actor).toBeTruthy();
      expect(lastAudit.action).toBeTruthy();
      expect(lastAudit.entity).toBeTruthy();
      expect(lastAudit.payload_json).toBeTruthy();
    }

    let site: { id: number };
    let page: { id: number };
    let s1: number;
    let s2: number;
    let dedupSnapId: number;
    let intent: { id: number };
    let runId: number;
    let changeId: number;
    let planId: number;
    let repairId: number;
    let valRunId: number;

    checkSingleAuditWrite('upsertSite', () => {
      site = repo.upsertSite('test-site', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101']);
    });

    checkSingleAuditWrite('upsertPage', () => {
      page = repo.upsertPage(site.id, '/items');
    });

    checkSingleAuditWrite('insertSnapshot', () => {
      s1 = repo.insertSnapshot(page.id, 'v1', { contentHash: 'hash-1', elements: [] });
    });

    checkSingleAuditWrite('insertSnapshot dedup', () => {
      dedupSnapId = repo.insertSnapshot(page.id, 'v1-dedup', { contentHash: 'hash-1', elements: [] });
      expect(dedupSnapId).toBe(s1);
    });

    checkSingleAuditWrite('insertSnapshot s2', () => {
      s2 = repo.insertSnapshot(page.id, 'v2', { contentHash: 'hash-2', elements: [] });
    });

    checkSingleAuditWrite('upsertIntentVersion', () => {
      intent = repo.upsertIntentVersion('checkout-intent', 'sha-intent-unique-1', 'yaml');
    });

    checkSingleAuditWrite('insertRun', () => {
      runId = repo.insertRun({ intentId: intent.id, intentSha: 'sha-intent-unique-1' });
    });

    checkSingleAuditWrite('finishRun', () => {
      repo.finishRun(runId, { verdict: 'PASS' });
    });

    checkSingleAuditWrite('insertChange', () => {
      changeId = repo.insertChange({
        baseSnapshotId: s1,
        headSnapshotId: s2,
        kind: 'ELEMENT_RENAMED',
        severity: 'LOW',
        classification: 'HARMLESS_UI',
        confidence: 0.99,
        evidence: [],
        affectedSteps: [],
        explanation: 'minor'
      });
    });

    checkSingleAuditWrite('insertStepPlan', () => {
      planId = repo.insertStepPlan({
        intentId: intent.id,
        siteId: site.id,
        steps: ['s1'],
        origin: 'baseline',
        startHash: 'hash-1'
      });
    });

    checkSingleAuditWrite('insertRepair', () => {
      repairId = repo.insertRepair({
        changeId,
        proposer: 'heuristic',
        proposal: {},
        stepPlanId: planId
      });
    });

    checkSingleAuditWrite('insertValidationRun', () => {
      valRunId = repo.insertValidationRun(repairId, runId, 'PASS', {});
    });

    checkSingleAuditWrite('insertOracleResults', () => {
      repo.insertOracleResults(valRunId, [{ oracle: 'oracle-1', ok: true, detail: {} }]);
    });

    checkSingleAuditWrite('insertApproval', () => {
      repo.insertApproval(repairId, 'approve', 'lead', 'ready');
    });

    checkSingleAuditWrite('insertKnownGood', () => {
      repo.insertKnownGood(page.id, s1, repairId, planId);
    });

    checkSingleAuditWrite('setRepairStatus', () => {
      repo.setRepairStatus(repairId, 'validated', 'tester', 'passing');
    });
  });
});
