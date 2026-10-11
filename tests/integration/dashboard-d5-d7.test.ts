import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { Repo } from '../../src/db/repo.js';
import { createServer } from '../../src/server/http.js';
import { buildRoutes } from '../../src/server/api.js';
import { openSession, type Session } from '../../src/browser/session.js';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { runIntent } from '../../src/pipeline/run.js';

describe('Dashboard D5, D6, D7 Integration — T19', { timeout: 120000 }, () => {
  let fV1: { url: string; stop(): Promise<void> } | undefined;
  let fV2: { url: string; stop(): Promise<void> } | undefined;
  let fV2Ambig: { url: string; stop(): Promise<void> } | undefined;
  let server: Server;
  let port: number;
  let session: Session;
  let repo: Repo;
  let dbPath: string;
  let healedChangeId: number;
  let validatedRepairId: number;

  beforeAll(async () => {
    // 1. Start fixtures for shop-v1, shop-v2, and shop-v2-ambiguous
    fV1 = await startFixture('shop-v1', '4101');
    fV2 = await startFixture('shop-v2', '4102');
    fV2Ambig = await startFixture('shop-v2-ambiguous', '4104');

    // 2. Run baseline on v1 and replay on v2 to seed changes & validated repair
    const temp = tempDb();
    repo = new Repo(temp.db);
    dbPath = temp.path;

    await runIntent('intents/checkout.intent.yaml', fV1.url, {
      db: dbPath,
      headless: true,
    });

    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2.url, {
      db: dbPath,
      headless: true,
    });
    expect(v2Outcome.verdict).toBe('HEALED_PASS');
    expect(v2Outcome.repairId).not.toBeNull();

    validatedRepairId = v2Outcome.repairId!;
    const changes = repo.listChanges({});
    expect(changes.length).toBeGreaterThan(0);
    healedChangeId = changes[0].id;

    // 3. Start local dashboard server
    server = createServer(buildRoutes(repo), resolve('dashboard'));
    await new Promise<void>((res) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        res();
      });
    });

    session = await openSession({ headless: true });
  }, 120000);

  afterAll(async () => {
    if (session) await session.close();
    if (server) {
      await new Promise<void>((res) => server.close(() => res()));
    }
    if (fV1) await fV1.stop();
    if (fV2) await fV2.stop();
    if (fV2Ambig) await fV2Ambig.stop();
  });

  it('[R-F5-05] repair preview shows old and new targets and the explanation', async () => {
    // Seed a repair with explicit old and new targets and alternatives
    const previewRepairId = repo.insertRepair({
      changeId: healedChangeId,
      proposer: 'heuristic',
      proposal: {
        steps: [
          {
            stepId: 's1',
            action: 'click',
            pagePath: '/',
            oldTarget: { name: 'Add to cart', selector: '#add-GZ-MINI' },
            target: {
              name: 'Add to bag',
              selector: '[data-action="add"]',
              snapshotId: 1,
              role: 'button',
              tag: 'button',
              text: 'Add to bag',
              label: '',
              attrs: {},
              nearText: '',
              bbox: { x: 0, y: 0, w: 0, h: 0 },
              ref: 'ref_1',
            },
            provenance: 'repair-match',
            score: 0.95,
            alternatives: [{ name: 'Shopping Bag', score: 0.42 }],
          },
        ],
        pendingChoice: null,
        explanation: 'Replaced Add to cart button with Add to bag button',
      },
      status: 'proposed',
      explanation: 'Replaced Add to cart button with Add to bag button',
    });

    // 1. Check in Repair View (#/repairs/:id)
    const repairUrl = `http://127.0.0.1:${port}/#/repairs/${previewRepairId}`;
    await session.page.goto(repairUrl);
    await session.page.waitForSelector('#view-repair:not([hidden])');

    const table = session.page.locator('.repair-steps-table');
    expect(await table.isVisible()).toBe(true);

    // Assert table columns: stepId, action, target, provenance, score, alternatives
    const row = table.locator('tbody tr').first();
    const stepIdCell = row.locator('td').nth(0);
    const actionCell = row.locator('td').nth(1);
    const targetCell = row.locator('td.step-target');
    const provBadge = row.locator('.provenance-badge');
    const scoreCell = row.locator('td').nth(4);
    const altsCell = row.locator('td').nth(5);

    expect(await stepIdCell.textContent()).toBe('s1');
    expect(await actionCell.textContent()).toBe('click');

    const targetText = await targetCell.textContent();
    expect(targetText).toContain('Add to cart');
    expect(targetText).toContain('#add-GZ-MINI');
    expect(targetText).toContain('→');
    expect(targetText).toContain('Add to bag');
    expect(targetText).toContain('[data-action="add"]');

    // Selector spans have .mono class
    const monoSelectors = targetCell.locator('.mono');
    expect(await monoSelectors.count()).toBe(2);

    expect(await provBadge.textContent()).toBe('repair-match');
    expect(await scoreCell.textContent()).toBe('0.95');
    expect(await altsCell.textContent()).toContain('Shopping Bag 0.42');

    // Explanation paragraph
    const exp = session.page.locator('.repair-explanation');
    expect(await exp.textContent()).toContain('Replaced Add to cart button with Add to bag button');

    // 2. Also check in Change View (#/changes/:id)
    const changeUrl = `http://127.0.0.1:${port}/#/changes/${healedChangeId}`;
    await session.page.goto(changeUrl);
    await session.page.waitForSelector('#view-change:not([hidden])');

    const changePreviewTable = session.page.locator('#repair-preview .repair-steps-table');
    expect(await changePreviewTable.first().isVisible()).toBe(true);
    const changeTargetText = await changePreviewTable.first().locator('td.step-target').first().textContent();
    expect(changeTargetText).toContain('Add to bag');
  });

  it('[R-F5-06] approve via dialog sets status applied and shows the seal; reject and rollback require a reason', async () => {
    // 1. Approve flow
    const url = `http://127.0.0.1:${port}/#/repairs/${validatedRepairId}`;
    await session.page.goto(url);
    await session.page.waitForSelector('#view-repair:not([hidden])');

    const btnApprove = session.page.locator('#view-repair #btn-approve');
    expect(await btnApprove.isVisible()).toBe(true);
    expect(await btnApprove.isDisabled()).toBe(false);

    // Click Approve to open dialog
    await btnApprove.click();
    const dialog = session.page.locator('#confirm-dialog');
    await session.page.waitForSelector('#confirm-dialog[open]');

    // Try confirming with empty reason
    const actorInput = session.page.locator('#actor');
    const reasonInput = session.page.locator('#reason');
    const confirmBtn = session.page.locator('#confirm-btn');

    await actorInput.fill('lead-reviewer');
    await reasonInput.fill('');
    await confirmBtn.click();

    // Dialog stays open and shows error in role="alert"
    const alertMsg = session.page.locator('#confirm-dialog [role="alert"]');
    expect(await alertMsg.isVisible()).toBe(true);
    expect(await alertMsg.textContent()).toMatch(/reason.*required/i);
    expect(await dialog.isVisible()).toBe(true);
    expect(repo.getRepair(validatedRepairId)?.status).toBe('validated');

    // Now fill reason and submit
    await reasonInput.fill('Approved harmless redesign');
    await confirmBtn.click();

    // Dialog closes and page re-renders
    await session.page.waitForSelector('.seal');

    const seal = session.page.locator('.seal').first();
    expect(await seal.isVisible()).toBe(true);
    expect(await seal.textContent()).toBe('APPROVED');

    // DB status updated to applied
    const updatedRepair = repo.getRepair(validatedRepairId);
    expect(updatedRepair?.status).toBe('applied');

    // 2. Reject flow with reason requirement
    const proposedRepairId = repo.insertRepair({
      changeId: healedChangeId,
      proposer: 'heuristic',
      proposal: { steps: [] },
      status: 'proposed',
      explanation: 'Proposal for reject test',
    });

    await session.page.goto(`http://127.0.0.1:${port}/#/repairs/${proposedRepairId}`);
    await session.page.waitForSelector('#view-repair:not([hidden])');

    const btnReject = session.page.locator('#view-repair #btn-reject');
    expect(await btnReject.isDisabled()).toBe(false);
    await btnReject.click();

    await session.page.waitForSelector('#confirm-dialog[open]');
    await actorInput.fill('qa-tester');
    await reasonInput.fill('');
    await confirmBtn.click();

    expect(await alertMsg.isVisible()).toBe(true);
    expect(repo.getRepair(proposedRepairId)?.status).toBe('proposed');

    await reasonInput.fill('Regression detected in payment step');
    await confirmBtn.click();

    await session.page.waitForSelector('#confirm-dialog', { state: 'hidden' });
    expect(repo.getRepair(proposedRepairId)?.status).toBe('rejected');

    // 3. Rollback flow with reason requirement on applied repair
    await session.page.goto(`http://127.0.0.1:${port}/#/repairs/${validatedRepairId}`);
    await session.page.waitForSelector('#view-repair:not([hidden])');

    const btnRollback = session.page.locator('#view-repair #btn-rollback');
    expect(await btnRollback.isDisabled()).toBe(false);
    await btnRollback.click();

    await session.page.waitForSelector('#confirm-dialog[open]');
    await actorInput.fill('operator-1');
    await reasonInput.fill('');
    await confirmBtn.click();

    expect(await alertMsg.isVisible()).toBe(true);
    expect(repo.getRepair(validatedRepairId)?.status).toBe('applied');

    await reasonInput.fill('Rollback required due to checkout anomaly');
    await confirmBtn.click();

    await session.page.waitForSelector('#confirm-dialog', { state: 'hidden' });
    expect(repo.getRepair(validatedRepairId)?.status).toBe('rolled_back');
  });

  it('[R-F5-07] repair view lists validation results and audit rows', async () => {
    // 1. Insert validation run with oracle results
    const runId = repo.insertRun({
      kind: 'validation',
      intentId: 1,
      intentSha: 'sha_test_123',
      targetOrigin: fV2!.url,
    });
    repo.finishRun(runId, {
      verdict: 'PASS',
      explanation: 'Validation passed cleanly',
    });

    const vRunId = repo.insertValidationRun(
      validatedRepairId,
      runId,
      'PASS',
      { passed: 2, total: 2 }
    );

    repo.insertOracleResults(vRunId, [
      {
        oracle: 'order-confirmed',
        ok: true,
        detail: { orderId: 'ord_12345', status: 'PAID', supportingOnly: false },
      },
      {
        oracle: 'telemetry-metric',
        ok: true,
        detail: { latencyMs: 142, supportingOnly: true },
      },
    ]);

    // 2. Insert audit rows for this repair
    repo.db
      .prepare(
        'INSERT INTO audit_log(actor, action, entity, entity_id, payload_json) VALUES (?, ?, ?, ?, ?)'
      )
      .run('system:validator', 'validate', 'repairs', validatedRepairId, JSON.stringify({ verdict: 'PASS' }));

    // 3. Navigate to repair view and reload to fetch latest data
    const url = `http://127.0.0.1:${port}/#/repairs/${validatedRepairId}`;
    await session.page.goto(url);
    await session.page.reload();
    await session.page.waitForSelector('#view-repair:not([hidden])');

    // Validation runs table
    const valTable = session.page.locator('.validation-runs-table');
    expect(await valTable.isVisible()).toBe(true);

    const valText = await valTable.textContent();
    expect(valText).toContain(`#${vRunId}`);
    expect(valText).toContain('PASS');

    // Oracle results list
    const oracleList = session.page.locator('.oracle-results-list').first();
    expect(await oracleList.isVisible()).toBe(true);

    const oracleItems = oracleList.locator('.oracle-item');
    expect(await oracleItems.count()).toBe(2);

    const item1Text = await oracleItems.nth(0).textContent();
    expect(item1Text).toContain('✓');
    expect(item1Text).toContain('order-confirmed');
    expect(item1Text).toContain('ord_12345');

    const item2Text = await oracleItems.nth(1).textContent();
    expect(item2Text).toContain('✓');
    expect(item2Text).toContain('telemetry-metric');
    expect(item2Text).toContain('supporting only');

    // Audit trail table for this repair
    const auditTable = session.page.locator('.audit-table');
    expect(await auditTable.isVisible()).toBe(true);
    const auditText = await auditTable.textContent();
    expect(auditText).toContain('system:validator');
    expect(auditText).toContain('validate');

    // 4. Global audit table view (#/audit)
    await session.page.goto(`http://127.0.0.1:${port}/#/audit`);
    await session.page.waitForSelector('#view-audit:not([hidden])');

    const globalAuditTable = session.page.locator('.global-audit-table');
    expect(await globalAuditTable.isVisible()).toBe(true);

    const entitySelect = session.page.locator('#audit-entity-select');
    expect(await entitySelect.isVisible()).toBe(true);

    await entitySelect.selectOption('repairs');
    await session.page.waitForTimeout(200);

    const filteredAuditText = await globalAuditTable.textContent();
    expect(filteredAuditText).toContain('repairs');
    expect(filteredAuditText).toContain('system:validator');
  });

  it('needs_review repair shows candidate choices and Validate choice calls resolve', async () => {
    // 1. Replay baseline v1 intent on v2-ambiguous fixture to produce a needs_review repair
    const ambOutcome = await runIntent('intents/checkout.intent.yaml', fV2Ambig!.url, {
      db: dbPath,
      headless: true,
    });
    expect(ambOutcome.verdict).toBe('NEEDS_REVIEW');
    expect(ambOutcome.repairId).not.toBeNull();

    const ambRepairId = ambOutcome.repairId!;
    const repairRow = repo.getRepair(ambRepairId);
    expect(repairRow?.status).toBe('needs_review');

    // 2. Navigate to the repair view
    const url = `http://127.0.0.1:${port}/#/repairs/${ambRepairId}`;
    await session.page.goto(url);
    await session.page.waitForSelector('#view-repair:not([hidden])');

    // Candidate choices container exists
    const candContainer = session.page.locator('.candidates-container');
    expect(await candContainer.isVisible()).toBe(true);

    const radios = candContainer.locator('input[type="radio"]');
    expect(await radios.count()).toBeGreaterThanOrEqual(2);

    const validateBtn = session.page.locator('#btn-validate-choice');
    expect(await validateBtn.isVisible()).toBe(true);
    expect(await validateBtn.isDisabled()).toBe(false);

    // Pick candidate "Complete order"
    const labels = candContainer.locator('label.checkbox-label');
    const labelCount = await labels.count();
    let completeOrderIndex = -1;
    for (let i = 0; i < labelCount; i++) {
      const text = await labels.nth(i).textContent();
      if (text && text.toLowerCase().includes('complete order')) {
        completeOrderIndex = i;
        break;
      }
    }
    expect(completeOrderIndex).toBeGreaterThanOrEqual(0);

    await radios.nth(completeOrderIndex).check();
    expect(await radios.nth(completeOrderIndex).isChecked()).toBe(true);

    // Click "Validate choice" and wait for /resolve response
    await Promise.all([
      session.page.waitForResponse(
        (resp) => resp.url().includes('/resolve') && resp.status() === 200,
        { timeout: 30000 }
      ),
      validateBtn.click(),
    ]);

    // Check DB status updated to validated
    const updatedRepair = repo.getRepair(ambRepairId);
    expect(updatedRepair?.status).toBe('validated');

    // Re-navigating or re-rendered view shows validated status and enabled Approve button
    const approveBtn = session.page.locator('#view-repair #btn-approve');
    await session.page.waitForSelector('#view-repair #btn-approve:not([disabled])', { timeout: 10000 });
    expect(await approveBtn.isDisabled()).toBe(false);
  });
});
