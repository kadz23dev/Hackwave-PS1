import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../src/db/index.js';
import { Repo } from '../../src/db/repo.js';
import { createServer } from '../../src/server/http.js';
import { buildRoutes } from '../../src/server/api.js';
import { csrfToken } from '../../src/server/csrf.js';

describe('Local API — T16', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;
  let repo: Repo;
  let repairId: number;

  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'healtest-api-'));
    const staticDir = join(tempDir, 'dashboard');
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(join(staticDir, 'index.html'), '<html><body>Dashboard</body></html>', 'utf8');

    const dbPath = join(tempDir, 'test.sqlite');
    const db = openDb(dbPath);
    repo = new Repo(db);

    // Seed site
    const site = repo.upsertSite('Gizmo Shop', 'http://127.0.0.1:4101', ['http://127.0.0.1:4101']);
    const intentRow = repo.upsertIntentVersion(
      'checkout-test',
      'sha123',
      'name: checkout-test\nsite: Gizmo Shop\ngoal: test\nstartPath: /\nallowedOrigins:\n  - http://127.0.0.1:4101\nactionBudget: 10\ndata: {}\nplanner:\n  doneWhen:\n    pathPattern: ".*"\nexpected: []'
    );
    const page = repo.upsertPage(site.id, '/');
    const snapId = repo.insertSnapshot(page.id, 'v1', {
      contentHash: 'hash1',
      dom: [],
      a11y: {},
    });

    const stepPlanId = repo.insertStepPlan({
      intentId: intentRow.id,
      siteId: site.id,
      steps: [
        {
          stepId: 's1',
          action: 'click',
          pagePath: '/',
          target: {
            role: 'button',
            name: 'Submit',
            tag: 'button',
            text: 'Submit',
            label: '',
            attrs: {},
            nearText: '',
            bbox: { x: 0, y: 0, w: 0, h: 0 },
            selector: 'button',
            snapshotId: snapId,
            ref: 'e1',
          },
          dataKey: null,
          provenance: 'replay',
        },
      ],
      origin: 'repair',
      startHash: 'hash1',
    });

    const changeId = repo.insertChange({
      baseSnapshotId: snapId,
      headSnapshotId: snapId,
      kind: 'ELEMENT_RENAMED',
      severity: 'LOW',
      classification: 'HARMLESS_UI',
      confidence: 0.9,
      evidence: [],
      affectedSteps: ['s1'],
      explanation: 'Renamed',
    });

    repairId = repo.insertRepair({
      changeId,
      proposer: 'heuristic',
      proposal: { steps: [] },
      status: 'proposed',
      stepPlanId,
      explanation: 'Proposed',
    });

    const valRunId = repo.insertRun({
      intentId: intentRow.id,
      intentSha: 'sha123',
      kind: 'validation',
    });
    repo.insertValidationRun(repairId, valRunId, 'PASS', { verdict: 'PASS' });
    repo.finishRun(valRunId, { verdict: 'PASS' });
    repo.setRepairStatus(repairId, 'validated', 'validator');

    // Create server with routes
    const routes = buildRoutes(repo);
    server = createServer(routes, staticDir);

    await new Promise<void>((resolvePromise) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolvePromise();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      });
    }
  });

  it('GET /api/sites returns the seeded site with health badge', async () => {
    const res = await fetch(`${baseUrl}/api/sites`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Array<{ name: string; health: string }>;
    expect(Array.isArray(data)).toBe(true);
    const site = data.find((s) => s.name === 'Gizmo Shop');
    expect(site).toBeDefined();
    expect(site?.health).toBe('PASS');
  });

  it('POST approve without CSRF → 403; without confirm → 400; valid → 200 and status applied', async () => {
    // 1. Without CSRF header -> 403
    const resNoCsrf = await fetch(`${baseUrl}/api/repairs/${repairId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true, actor: 'auditor', reason: 'looks good' }),
    });
    expect(resNoCsrf.status).toBe(403);

    // 2. Without confirm: true -> 400
    const resNoConfirm = await fetch(`${baseUrl}/api/repairs/${repairId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ actor: 'auditor', reason: 'looks good' }),
    });
    expect(resNoConfirm.status).toBe(400);

    // 3. Valid -> 200 and status applied
    const resValid = await fetch(`${baseUrl}/api/repairs/${repairId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ confirm: true, actor: 'auditor', reason: 'looks good' }),
    });
    expect(resValid.status).toBe(200);

    const updated = repo.getRepair(repairId);
    expect(updated?.status).toBe('applied');
  });

  it('static server refuses ../ traversal', async () => {
    const res = await fetch(`${baseUrl}/../package.json`);
    expect(res.status).toBe(404);
  });

  it('server binds 127.0.0.1 only', () => {
    const addr = server.address() as AddressInfo;
    expect(addr.address).toBe('127.0.0.1');
  });

  it('GET /api/session returns valid CSRF token', async () => {
    const res = await fetch(`${baseUrl}/api/session`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { csrf: string };
    expect(data.csrf).toBe(csrfToken);
  });

  it('large POST body > 1 MB is rejected with 413', async () => {
    const largePayload = 'a'.repeat(1024 * 1024 + 100);
    const res = await fetch(`${baseUrl}/api/repairs/${repairId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ data: largePayload }),
    });
    expect(res.status).toBe(413);
  });
});
