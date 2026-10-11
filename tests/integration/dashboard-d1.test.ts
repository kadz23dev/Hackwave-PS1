import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { openDb } from '../../src/db/index.js';
import { Repo } from '../../src/db/repo.js';
import { createServer } from '../../src/server/http.js';
import { buildRoutes } from '../../src/server/api.js';
import { openSession, type Session } from '../../src/browser/session.js';

describe('Dashboard D1 Overview Integration — T17', { timeout: 60000 }, () => {
  let server: Server;
  let port: number;
  let session: Session;
  let repo: Repo;

  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'healtest-d1-'));
    const dbPath = join(tempDir, 'test.sqlite');
    const db = openDb(dbPath);
    repo = new Repo(db);

    // Seed test data: site, intent, page, snapshot, runs
    const site = repo.upsertSite('Gizmo Shop', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101']);
    const intentRow = repo.upsertIntentVersion(
      'checkout-test',
      'sha_test_123',
      'name: checkout-test\nsite: Gizmo Shop\ngoal: test\nstartPath: /\nallowedOrigins:\n  - http://127.0.0.1:4101\nactionBudget: 10\ndata: {}\nplanner:\n  doneWhen:\n    pathPattern: ".*"\nexpected: []'
    );
    const page = repo.upsertPage(site.id, '/');
    const snapId = repo.insertSnapshot(page.id, 'v1', {
      contentHash: 'hash1',
      dom: [],
      a11y: {},
    });

    // Run 1: PASS
    const run1Id = repo.insertRun({
      intentId: intentRow.id,
      snapshotId: snapId,
      intentSha: 'sha_test_123',
      kind: 'run',
      targetOrigin: 'http://127.0.0.1:4101',
    });
    repo.finishRun(run1Id, {
      verdict: 'PASS',
      explanation: 'Test passed',
      llmCalls: 0,
    });

    // Run 2: APP_BUG
    const run2Id = repo.insertRun({
      intentId: intentRow.id,
      snapshotId: snapId,
      intentSha: 'sha_test_123',
      kind: 'run',
      targetOrigin: 'http://127.0.0.1:4103',
    });
    repo.finishRun(run2Id, {
      verdict: 'APP_BUG',
      explanation: 'Backend error 500',
      llmCalls: 1,
    });

    const staticDir = resolve('dashboard');
    server = createServer(buildRoutes(repo), staticDir);

    await new Promise<void>((res) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        res();
      });
    });

    session = await openSession({ headless: true });
  });

  afterAll(async () => {
    if (session) await session.close();
    if (server) {
      await new Promise<void>((res) => server.close(() => res()));
    }
  });

  it('[R-F5-01] dashboard overview lists sites and recent runs with verdict badges', async () => {
    const url = `http://127.0.0.1:${port}/#/`;
    await session.page.goto(url);
    await session.page.waitForLoadState('networkidle').catch(() => {});

    // Header & Brand
    const brand = await session.page.textContent('.brand');
    expect(brand?.trim()).toBe('Kaizen AI');

    // Nav links
    const navText = await session.page.textContent('nav');
    expect(navText).toContain('Overview');
    expect(navText).toContain('Changes');
    expect(navText).toContain('Audit');

    // Overview section visible
    const overviewSec = session.page.locator('#view-overview');
    expect(await overviewSec.isVisible()).toBe(true);

    // Sites table rendered with seeded data
    const sitesTable = session.page.locator('.sites-table');
    expect(await sitesTable.isVisible()).toBe(true);
    const sitesText = await sitesTable.textContent();
    expect(sitesText).toContain('Gizmo Shop');
    expect(sitesText).toContain('http://127.0.0.1:4101');

    // Runs table rendered with seeded data
    const runsTable = session.page.locator('.runs-table');
    expect(await runsTable.isVisible()).toBe(true);
    const runsText = await runsTable.textContent();
    expect(runsText).toContain('PASS');
    expect(runsText).toContain('APP BUG');

    // Badges inside runs table
    const passBadge = runsTable.locator('.badge--pass');
    expect(await passBadge.isVisible()).toBe(true);
    expect(await passBadge.textContent()).toContain('✓');
    expect(await passBadge.textContent()).toContain('PASS');

    const bugBadge = runsTable.locator('.badge--bug');
    expect(await bugBadge.isVisible()).toBe(true);
    expect(await bugBadge.textContent()).toContain('✕');
    expect(await bugBadge.textContent()).toContain('APP BUG');

    // Test Theme toggle button
    const themeBtn = session.page.locator('#theme-toggle');
    await themeBtn.click();
    let themeAttr = await session.page.evaluate(() => document.documentElement.dataset.theme);
    expect(themeAttr).toBe('light');

    await themeBtn.click();
    themeAttr = await session.page.evaluate(() => document.documentElement.dataset.theme);
    expect(themeAttr).toBe('dark');

    await themeBtn.click();
    themeAttr = await session.page.evaluate(() => document.documentElement.dataset.theme);
    expect(themeAttr).toBeUndefined();
  });

  it('[R-F5-08] dashboard uses only tokens.css colours', () => {
    const stdout = execSync('node scripts/check-dashboard.mjs', { encoding: 'utf8' });
    expect(stdout).toContain('dashboard palette ok');
  });

  it('badges show icon and text label for every verdict', async () => {
    const verdicts = ['PASS', 'HEALED_PASS', 'APP_BUG', 'NEEDS_REVIEW', 'FAIL_UNREPAIRABLE', 'PROPOSED'] as const;

    const results = await session.page.evaluate((verdictList) => {
      // @ts-expect-error window.App injected in dashboard
      const { BADGE, badge } = window.App;
      return verdictList.map((v: string) => {
        const b = badge(v);
        const iconSpan = b.querySelector('.badge__icon');
        const labelSpan = b.querySelector('.badge__label');
        return {
          verdict: v,
          expectedLabel: BADGE[v][1],
          icon: iconSpan?.textContent?.trim(),
          ariaHidden: iconSpan?.getAttribute('aria-hidden'),
          label: labelSpan?.textContent?.trim(),
          fullText: b.textContent,
        };
      });
    }, verdicts);

    for (const r of results) {
      expect(r.icon?.length).toBeGreaterThan(0);
      expect(r.ariaHidden).toBe('true');
      expect(r.label).toBe(r.expectedLabel);
      expect(r.fullText).toContain(r.expectedLabel);
    }
  });
});
