import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '../../src/db/index.js';
import { Repo } from '../../src/db/repo.js';
import { createServer } from '../../src/server/http.js';
import { buildRoutes } from '../../src/server/api.js';

describe('UI Backend Endpoints & Auth Integration', () => {
  let server: Server;
  let port: number;
  let repo: Repo;
  let baseUrl: string;

  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'healtest-ui-backend-'));
    const dbPath = join(tempDir, 'test.sqlite');
    const db = openDb(dbPath);
    repo = new Repo(db);

    const staticDir = resolve('dashboard');
    server = createServer(buildRoutes(repo), staticDir);

    await new Promise<void>((res) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        res();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((res) => server.close(() => res()));
    }
  });

  it('handles auth signup, login, and me endpoints with Firebase/SQLite', async () => {
    // 1. Signup new user
    const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'password123',
        name: 'Alice Engineer',
      }),
    });
    expect(signupRes.status).toBe(200);
    const signupData = (await signupRes.json()) as { ok: boolean; user: { email: string; displayName: string } };
    expect(signupData.ok).toBe(true);
    expect(signupData.user.email).toBe('alice@example.com');
    expect(signupData.user.displayName).toBe('Alice Engineer');

    // 2. Duplicate signup fails with 400
    const dupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'password123',
      }),
    });
    expect(dupRes.status).toBe(400);

    // 3. Login with correct password
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'password123',
      }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = (await loginRes.json()) as { ok: boolean; user: { email: string } };
    expect(loginData.ok).toBe(true);
    expect(loginData.user.email).toBe('alice@example.com');

    // 4. Login with incorrect password fails with 401
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'wrongpassword',
      }),
    });
    expect(badLoginRes.status).toBe(401);

    // 5. GET /api/auth/me returns user
    const meRes = await fetch(`${baseUrl}/api/auth/me`);
    expect(meRes.status).toBe(200);
    const meData = (await meRes.json()) as { ok: boolean; user: { email: string } };
    expect(meData.ok).toBe(true);
    expect(meData.user).toBeDefined();

    // 6. GET /api/auth/config returns public configuration
    const cfgRes = await fetch(`${baseUrl}/api/auth/config`);
    expect(cfgRes.status).toBe(200);
    const cfgData = (await cfgRes.json()) as { authDomain: string };
    expect(cfgData.authDomain).toBeDefined();
  });

  it('performs CRUD operations on notes with search filtering', async () => {
    // 1. GET initial notes (seeded from migration 004)
    const listRes = await fetch(`${baseUrl}/api/notes`);
    expect(listRes.status).toBe(200);
    const notes = (await listRes.json()) as Array<{ id: number; title: string }>;
    expect(notes.length).toBeGreaterThanOrEqual(3);

    // 2. POST create new note
    const createRes = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'HealTest Checkout Observation',
        tag: 'Integration',
        body: 'Verified selector transition from add-to-cart to add-to-bag.',
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = (await createRes.json()) as { ok: boolean; note: { id: number; title: string } };
    expect(createData.ok).toBe(true);
    const noteId = createData.note.id;

    // 3. PUT update note
    const updateRes = await fetch(`${baseUrl}/api/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated Note Title',
        tag: 'Integration',
        body: 'Updated body description.',
      }),
    });
    expect(updateRes.status).toBe(200);

    // 4. Search notes
    const searchRes = await fetch(`${baseUrl}/api/notes?q=Updated`);
    const searchResults = (await searchRes.json()) as Array<{ id: number; title: string }>;
    expect(searchResults.some((n) => n.id === noteId)).toBe(true);

    // 5. DELETE note
    const delRes = await fetch(`${baseUrl}/api/notes/${noteId}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);

    // Verify deletion
    const verifyDelRes = await fetch(`${baseUrl}/api/notes?q=Updated`);
    const remaining = (await verifyDelRes.json()) as Array<{ id: number }>;
    expect(remaining.some((n) => n.id === noteId)).toBe(false);
  });

  it('manages workspace settings and billing plans', async () => {
    // 1. GET settings
    const getSetRes = await fetch(`${baseUrl}/api/settings`);
    expect(getSetRes.status).toBe(200);
    const settings = (await getSetRes.json()) as { name: string; target: string };
    expect(settings.name).toBeDefined();

    // 2. POST update settings
    const saveSetRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lead Architect',
        email: 'architect@healtest.dev',
        timeout: 20000,
        target: 'http://127.0.0.1:4102',
      }),
    });
    expect(saveSetRes.status).toBe(200);

    // 3. GET billing status
    const billRes = await fetch(`${baseUrl}/api/billing`);
    expect(billRes.status).toBe(200);
    const billData = (await billRes.json()) as { ok: boolean; currentPlan: string };
    expect(billData.ok).toBe(true);
    expect(billData.currentPlan).toBe('FREE');

    // 4. Upgrade plan to PRO
    const upgRes = await fetch(`${baseUrl}/api/billing/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'PRO' }),
    });
    expect(upgRes.status).toBe(200);

    const billAfterRes = await fetch(`${baseUrl}/api/billing`);
    const billAfterData = (await billAfterRes.json()) as { currentPlan: string };
    expect(billAfterData.currentPlan).toBe('PRO');
  });

  it('executes AI agent run endpoint and returns self-healing verdict and logs', async () => {
    const runRes = await fetch(`${baseUrl}/api/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intentText: 'Complete checkout using a valid card.',
        targetUrl: 'http://127.0.0.1:4102',
      }),
    });
    expect(runRes.status).toBe(200);
    const runData = (await runRes.json()) as {
      ok: boolean;
      verdict: string;
      healing: { newSelector: string; score: string };
      logs: Array<{ level: string; msg: string }>;
    };
    expect(runData.ok).toBe(true);
    expect(runData.verdict).toBe('HEALED_PASS');
    expect(runData.healing.newSelector).toBe('#add-to-bag');
    expect(runData.logs.length).toBeGreaterThan(0);
  });
});
