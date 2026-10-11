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

describe('Dashboard D2, D3, D4 Integration — T18', { timeout: 90000 }, () => {
  let fV1: { url: string; stop(): Promise<void> } | undefined;
  let fV2: { url: string; stop(): Promise<void> } | undefined;
  let server: Server;
  let port: number;
  let session: Session;
  let repo: Repo;
  let healedChangeId: number;
  let lowChangeId: number;

  beforeAll(async () => {
    // 1. Start fixtures for shop-v1 and shop-v2
    fV1 = await startFixture('shop-v1', '4101');
    fV2 = await startFixture('shop-v2', '4102');

    // 2. Run baseline on v1 and replay on v2 to seed changes
    const { db, path: dbPath } = tempDb();
    repo = new Repo(db);

    await runIntent('intents/checkout.intent.yaml', fV1.url, {
      db: dbPath,
      headless: true,
    });

    const v2Outcome = await runIntent('intents/checkout.intent.yaml', fV2.url, {
      db: dbPath,
      headless: true,
    });
    expect(v2Outcome.verdict).toBe('HEALED_PASS');

    // Verify changes were produced
    const changes = repo.listChanges({});
    expect(changes.length).toBeGreaterThan(0);

    const firstChange = changes[0];
    healedChangeId = firstChange.id;

    // Seed a LOW severity change to guarantee severity filter testing
    lowChangeId = repo.insertChange({
      baseSnapshotId: firstChange.base_snapshot_id,
      headSnapshotId: firstChange.head_snapshot_id,
      kind: 'ATTR_CHANGED',
      severity: 'LOW',
      classification: 'HARMLESS_UI',
      confidence: 0.99,
      evidence: [
        {
          kind: 'ATTR_CHANGED',
          before: {
            role: 'button',
            name: 'Old Label',
            selector: 'button.secondary',
            pagePath: '/',
            attrs: { 'data-theme': 'light' },
          },
          after: {
            role: 'button',
            name: 'New Label',
            selector: 'button.secondary',
            pagePath: '/',
            attrs: { 'data-theme': 'dark' },
          },
          evidence: 'Attribute data-theme changed',
        },
      ],
      affectedSteps: ['step_low_1'],
      explanation: 'Harmless theme attribute adjustment on secondary button.',
    });

    // Seed a MEDIUM severity change so LOW filter tests always have non-LOW results
    repo.insertChange({
      baseSnapshotId: firstChange.base_snapshot_id,
      headSnapshotId: firstChange.head_snapshot_id,
      kind: 'ATTR_CHANGED',
      severity: 'MEDIUM',
      classification: 'BREAKING_UI',
      confidence: 0.9,
      evidence: [
        {
          kind: 'ATTR_CHANGED',
          before: {
            role: 'button',
            name: 'Submit',
            selector: 'button.primary',
            pagePath: '/',
            attrs: { 'data-state': 'ready' },
          },
          after: {
            role: 'button',
            name: 'Submit',
            selector: 'button.primary',
            pagePath: '/',
            attrs: { 'data-state': 'disabled' },
          },
          evidence: 'Primary button state attribute changed',
        },
      ],
      affectedSteps: ['step_medium_1'],
      explanation: 'Primary action button state changed and may affect flow.',
    });

    // 3. Start local dashboard server
    server = createServer(buildRoutes(repo), resolve('dashboard'));
    await new Promise<void>((res) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        res();
      });
    });

    session = await openSession({ headless: true });
  }, 90000);

  afterAll(async () => {
    if (session) await session.close();
    if (server) {
      await new Promise<void>((res) => server.close(() => res()));
    }
    if (fV1) await fV1.stop();
    if (fV2) await fV2.stop();
  });

  it('[R-F5-02] change view shows before and after screenshots', async () => {
    const url = `http://127.0.0.1:${port}/#/changes/${healedChangeId}`;
    await session.page.goto(url);
    await session.page.waitForSelector('#view-change:not([hidden])');

    // Header displays change id / displayId + severity + classification
    const header = session.page.locator('.change-view-header');
    const headerText = await header.textContent();
    expect(headerText).toMatch(/Change chg_\d+/);

    // D2 screenshots container and figures
    const screenshots = session.page.locator('.screenshots-container');
    expect(await screenshots.isVisible()).toBe(true);

    const figures = screenshots.locator('figure');
    expect(await figures.count()).toBe(2);

    // Assert Before and After figures have img or fallback
    const beforeFig = figures.nth(0);
    const afterFig = figures.nth(1);

    const beforeFigText = await beforeFig.textContent();
    expect(beforeFigText).toContain('Before:');

    const afterFigText = await afterFig.textContent();
    expect(afterFigText).toContain('After:');

    // Either <img> with alt="Before" or "No screenshot" paragraph is present
    const beforeImg = beforeFig.locator('img[alt="Before"]');
    const beforeFallback = beforeFig.locator('.no-screenshot');
    const hasBeforeContent = (await beforeImg.count()) > 0 || (await beforeFallback.count()) > 0;
    expect(hasBeforeContent).toBe(true);

    const afterImg = afterFig.locator('img[alt="After"]');
    const afterFallback = afterFig.locator('.no-screenshot');
    const hasAfterContent = (await afterImg.count()) > 0 || (await afterFallback.count()) > 0;
    expect(hasAfterContent).toBe(true);
  });

  it('[R-F5-03] change view shows side-by-side selector diff with changed cells marked', async () => {
    const url = `http://127.0.0.1:${port}/#/changes/${lowChangeId}`;
    await session.page.goto(url);
    await session.page.waitForSelector('#view-change:not([hidden])');

    // D3 Diff table exists
    const diffContainer = session.page.locator('.diff-container');
    expect(await diffContainer.isVisible()).toBe(true);

    const diffTable = diffContainer.locator('.diff-table');
    expect(await diffTable.isVisible()).toBe(true);

    // Columns: Field | Before | After
    const ths = diffTable.locator('th');
    expect(await ths.count()).toBe(3);
    expect(await ths.nth(0).textContent()).toBe('Field');
    expect(await ths.nth(1).textContent()).toBe('Before');
    expect(await ths.nth(2).textContent()).toBe('After');

    // Expected rows: role, name, selector, pagePath, attrs
    const rows = diffTable.locator('tbody tr');
    expect(await rows.count()).toBe(5);

    // Check cells marked with diff-changed
    const changedCells = diffTable.locator('.diff-changed');
    expect(await changedCells.count()).toBeGreaterThan(0);

    // Check that 'name' row (Old Label vs New Label) has '≠ ' in after cell
    const nameRow = rows.nth(1);
    const nameBefore = nameRow.locator('td').nth(1);
    const nameAfter = nameRow.locator('td').nth(2);
    expect(await nameBefore.textContent()).toBe('Old Label');
    expect(await nameAfter.textContent()).toBe('≠ New Label');
    expect(await nameBefore.evaluate((el) => el.classList.contains('diff-changed'))).toBe(true);
    expect(await nameAfter.evaluate((el) => el.classList.contains('diff-changed'))).toBe(true);

    // Check attrs row (row index 4) has mono class and diff-changed
    const attrsRow = rows.nth(4);
    const attrsBefore = attrsRow.locator('td').nth(1);
    const attrsAfter = attrsRow.locator('td').nth(2);
    expect(await attrsBefore.evaluate((el) => el.classList.contains('mono'))).toBe(true);
    expect(await attrsAfter.evaluate((el) => el.classList.contains('mono'))).toBe(true);
    expect(await attrsAfter.textContent()).toContain('≠ ');

    // Check placeholder #repair-preview is present
    const repairPreview = session.page.locator('#repair-preview');
    expect(await repairPreview.count()).toBe(1);
  });

  it('[R-F5-04] severity filter hides LOW changes when unchecked', async () => {
    const url = `http://127.0.0.1:${port}/#/changes`;
    await session.page.goto(url);
    await session.page.waitForSelector('#view-changes:not([hidden])');

    // Check left rail has 4 severity checkboxes
    const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    for (const sev of severities) {
      const cb = session.page.locator(`input[type="checkbox"][name="severity"][value="${sev}"]`);
      expect(await cb.isVisible()).toBe(true);
      expect(await cb.isChecked()).toBe(true);
    }

    // Check classification select exists
    const classSelect = session.page.locator('#classification-select');
    expect(await classSelect.isVisible()).toBe(true);

    // Wait for changes to load in list
    await session.page.waitForSelector('.change-card');

    // Both healed change and low change are initially visible
    const lowCardsInitially = session.page.locator('.change-card[data-severity="LOW"]');
    const mediumCardsInitially = session.page.locator('.change-card[data-severity="MEDIUM"]');
    expect(await lowCardsInitially.count()).toBeGreaterThan(0);
    expect(await mediumCardsInitially.count()).toBeGreaterThan(0);

    // Uncheck LOW checkbox
    const lowCheckbox = session.page.locator('input[type="checkbox"][name="severity"][value="LOW"]');
    await lowCheckbox.uncheck();

    // Wait for list to update: LOW cards disappear and non-LOW cards are rendered
    await session.page.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll('.change-card'));
      return (
        cards.length > 0 &&
        cards.every((card) => card.getAttribute('data-severity') !== 'LOW')
      );
    });

    const lowCardsAfter = session.page.locator('.change-card[data-severity="LOW"]');
    expect(await lowCardsAfter.count()).toBe(0);

    // Non-LOW changes should still be visible
    const mediumCardsAfter = session.page.locator('.change-card[data-severity="MEDIUM"]');
    expect(await mediumCardsAfter.count()).toBeGreaterThan(0);

    // Re-check LOW checkbox
    await lowCheckbox.check();

    // LOW changes return
    await session.page.waitForFunction(() => {
      return document.querySelectorAll('.change-card[data-severity="LOW"]').length > 0;
    });
    expect(await session.page.locator('.change-card[data-severity="LOW"]').count()).toBeGreaterThan(0);
  });
});
