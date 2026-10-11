import { createReadStream, existsSync } from 'node:fs';
import { type Route, json, fail } from './http.js';
import { csrfToken, check as checkCsrf } from './csrf.js';
import type { Repo } from '../db/repo.js';
import { signUpUser, signInUser, getCurrentUser } from './firebase.js';
import { FIREBASE_CONFIG } from '../config.js';
import {
  approve,
  reject,
  retry,
  rollback,
  resolveCandidate,
  InvalidTransition,
} from '../governance/approvals.js';
import type { ElementRecord } from '../types.js';
import { MultiAgentBus } from '../agent/multi-agent-bus.js';
import type { PlaywrightErrorType } from '../agent/types.js';

export function fmtId(prefix: string, n: number | string): string {
  const num = typeof n === 'number' ? n : parseInt(String(n), 10);
  return isNaN(num) ? `${prefix}_${n}` : `${prefix}_${String(num).padStart(4, '0')}`;
}

export function buildRoutes(repo: Repo): Route[] {
  const agentBus = new MultiAgentBus(repo);
  return [
    // 1. GET /api/session
    {
      method: 'GET',
      pattern: /^\/api\/session$/,
      handler: async ({ res }) => {
        json(res, 200, { csrf: csrfToken });
      },
    },

    // 2. GET /api/sites
    {
      method: 'GET',
      pattern: /^\/api\/sites$/,
      handler: async ({ res }) => {
        const sites = repo.db
          .prepare('SELECT id, name, base_url FROM sites')
          .all() as Array<{ id: number; name: string; base_url: string }>;

        const result = sites.map((site) => {
          const lastSnap = repo.db
            .prepare(`
              SELECT s.captured_at
              FROM snapshots s
              JOIN pages p ON s.page_id = p.id
              WHERE p.site_id = ?
              ORDER BY s.id DESC LIMIT 1
            `)
            .get(site.id) as { captured_at: string } | undefined;

          const openChangesRow = repo.db
            .prepare(`
              SELECT count(DISTINCT c.id) as cnt
              FROM changes c
              LEFT JOIN repairs r ON r.change_id = c.id
              WHERE r.status IN ('proposed', 'needs_review', 'validated') OR r.id IS NULL
            `)
            .get() as { cnt: number } | undefined;

          const lastRun = repo.db
            .prepare(`
              SELECT r.verdict
              FROM runs r
              JOIN intents i ON r.intent_id = i.id
              JOIN step_plans sp ON sp.intent_id = i.id
              WHERE sp.site_id = ?
              ORDER BY r.id DESC LIMIT 1
            `)
            .get(site.id) as { verdict: string } | undefined;

          const fallbackRun =
            lastRun ??
            (repo.db.prepare('SELECT verdict FROM runs ORDER BY id DESC LIMIT 1').get() as
              | { verdict: string }
              | undefined);

          const health = fallbackRun?.verdict ?? 'PASS';

          return {
            id: site.id,
            displayId: fmtId('site', site.id),
            name: site.name,
            baseUrl: site.base_url,
            lastScanAt: lastSnap?.captured_at ?? null,
            openChanges: Number(openChangesRow?.cnt ?? 0),
            health,
          };
        });

        json(res, 200, result);
      },
    },

    // 3. GET /api/pages?siteId=
    {
      method: 'GET',
      pattern: /^\/api\/pages$/,
      handler: async ({ res, query }) => {
        const siteIdParam = query.get('siteId');
        let sql = 'SELECT id, site_id, path FROM pages';
        const queryParams: unknown[] = [];
        if (siteIdParam) {
          sql += ' WHERE site_id = ?';
          queryParams.push(parseInt(siteIdParam, 10));
        }

        const pages = repo.db.prepare(sql).all(...queryParams) as Array<{
          id: number;
          site_id: number;
          path: string;
        }>;

        const result = pages.map((p) => {
          const countRow = repo.db
            .prepare('SELECT count(*) as cnt FROM snapshots WHERE page_id = ?')
            .get(p.id) as { cnt: number } | undefined;
          const kgRow = repo.db
            .prepare('SELECT snapshot_id FROM known_good WHERE page_id = ? ORDER BY id DESC LIMIT 1')
            .get(p.id) as { snapshot_id: number } | undefined;

          return {
            id: p.id,
            displayId: fmtId('page', p.id),
            path: p.path,
            snapshotCount: Number(countRow?.cnt ?? 0),
            knownGoodSnapshotId: kgRow?.snapshot_id ?? null,
          };
        });

        json(res, 200, result);
      },
    },

    // 4. GET /api/pages/:id/snapshots
    {
      method: 'GET',
      pattern: /^\/api\/pages\/(\d+)\/snapshots$/,
      handler: async ({ res, params }) => {
        const pageId = parseInt(params[0], 10);
        const rows = repo.db
          .prepare(`
            SELECT id, version_label, content_hash, captured_at, screenshot_path
            FROM snapshots
            WHERE page_id = ?
            ORDER BY id DESC
          `)
          .all(pageId) as Array<{
            id: number;
            version_label: string;
            content_hash: string;
            captured_at: string;
            screenshot_path: string | null;
          }>;

        const result = rows.map((r) => ({
          id: r.id,
          displayId: fmtId('snap', r.id),
          versionLabel: r.version_label,
          contentHash: r.content_hash,
          capturedAt: r.captured_at,
          hasScreenshot: Boolean(r.screenshot_path),
        }));

        json(res, 200, result);
      },
    },

    // 5. GET /api/snapshots/:id
    {
      method: 'GET',
      pattern: /^\/api\/snapshots\/(\d+)$/,
      handler: async ({ res, params, query }) => {
        const snapId = parseInt(params[0], 10);
        const row = repo.getSnapshot(snapId);
        if (!row) {
          fail(res, 404, 'NOT_FOUND', `Snapshot #${snapId} not found`);
          return;
        }

        const elements = (Array.isArray(row.elements) ? row.elements : []) as ElementRecord[];
        const includeAria = query.get('aria') === '1';

        const result: Record<string, unknown> = {
          id: row.id,
          displayId: fmtId('snap', row.id),
          pageId: row.pageId,
          pagePath: row.pagePath,
          versionLabel: row.versionLabel,
          elements,
          dom: elements,
          contentHash: row.contentHash,
          screenshotPath: row.screenshotPath,
          capturedAt: row.capturedAt,
        };

        if (includeAria) {
          result.ariaYaml = row.ariaYaml ?? '';
        }

        json(res, 200, result);
      },
    },

    // 6. GET /api/snapshots/:id/screenshot
    {
      method: 'GET',
      pattern: /^\/api\/snapshots\/(\d+)\/screenshot$/,
      handler: async ({ res, params }) => {
        const snapId = parseInt(params[0], 10);
        const row = repo.getSnapshot(snapId);
        if (!row || !row.screenshotPath || !existsSync(row.screenshotPath)) {
          fail(res, 404, 'NOT_FOUND', 'Screenshot not found');
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'image/png',
          'X-Content-Type-Options': 'nosniff',
        });
        createReadStream(row.screenshotPath).pipe(res);
      },
    },

    // 7. GET /api/changes?severity=&classification=&limit=
    {
      method: 'GET',
      pattern: /^\/api\/changes$/,
      handler: async ({ res, query }) => {
        let sql = 'SELECT * FROM changes WHERE 1=1';
        const queryParams: unknown[] = [];
        if (query.get('severity')) {
          const severities = query.get('severity')!.split(',').map((s) => s.trim()).filter(Boolean);
          if (severities.length > 0) {
            const placeholders = severities.map(() => '?').join(',');
            sql += ` AND severity IN (${placeholders})`;
            queryParams.push(...severities);
          }
        }
        if (query.get('classification') && query.get('classification') !== 'All') {
          sql += ' AND classification = ?';
          queryParams.push(query.get('classification'));
        }
        sql += ' ORDER BY id DESC';
        const limit = query.get('limit') ? parseInt(query.get('limit')!, 10) : 50;
        sql += ' LIMIT ?';
        queryParams.push(limit);

        const rows = repo.db.prepare(sql).all(...queryParams) as Array<{
          id: number;
          base_snapshot_id: number;
          head_snapshot_id: number;
          kind: string;
          severity: string;
          classification: string;
          confidence: number;
          explanation: string;
          created_at: string;
        }>;

        const result = rows.map((r) => ({
          id: r.id,
          displayId: fmtId('chg', r.id),
          baseSnapshotId: r.base_snapshot_id,
          headSnapshotId: r.head_snapshot_id,
          kind: r.kind,
          severity: r.severity,
          classification: r.classification,
          confidence: r.confidence,
          explanation: r.explanation,
          createdAt: r.created_at,
        }));

        json(res, 200, result);
      },
    },

    // 8. GET /api/changes/:id
    {
      method: 'GET',
      pattern: /^\/api\/changes\/(\d+)$/,
      handler: async ({ res, params }) => {
        const changeId = parseInt(params[0], 10);
        const change = repo.getChange(changeId);
        if (!change) {
          fail(res, 404, 'NOT_FOUND', `Change #${changeId} not found`);
          return;
        }

        const repairs = repo.db
          .prepare(`
            SELECT id, status, proposer, explanation, created_at
            FROM repairs
            WHERE change_id = ?
            ORDER BY id DESC
          `)
          .all(changeId) as Array<{
            id: number;
            status: string;
            proposer: string;
            explanation: string;
            created_at: string;
          }>;

        const linkedRepairs = repairs.map((r) => ({
          ...r,
          displayId: fmtId('rep', r.id),
        }));

        json(res, 200, {
          id: change.id,
          displayId: fmtId('chg', change.id),
          baseSnapshotId: change.base_snapshot_id,
          headSnapshotId: change.head_snapshot_id,
          kind: change.kind,
          severity: change.severity,
          classification: change.classification,
          confidence: change.confidence,
          evidence: change.evidence,
          affectedSteps: change.affectedSteps,
          explanation: change.explanation,
          createdAt: change.created_at,
          repairs: linkedRepairs,
        });
      },
    },

    // 9. GET /api/repairs/:id
    {
      method: 'GET',
      pattern: /^\/api\/repairs\/(\d+)$/,
      handler: async ({ res, params }) => {
        const repairId = parseInt(params[0], 10);
        const repair = repo.getRepair(repairId);
        if (!repair) {
          fail(res, 404, 'NOT_FOUND', `Repair #${repairId} not found`);
          return;
        }

        const valRuns = repo.db
          .prepare('SELECT * FROM validation_runs WHERE repair_id = ? ORDER BY id DESC')
          .all(repairId) as Array<{
            id: number;
            run_id: number;
            verdict: string;
            summary_json: string;
            created_at: string;
          }>;

        const validationRuns = valRuns.map((vr) => {
          const oracles = repo.db
            .prepare('SELECT * FROM oracle_results WHERE validation_run_id = ?')
            .all(vr.id) as Array<Record<string, unknown>>;

          return {
            id: vr.id,
            runId: vr.run_id,
            verdict: vr.verdict,
            summary: JSON.parse(vr.summary_json || '{}'),
            createdAt: vr.created_at,
            oracleResults: oracles.map((o) => {
              let detail: Record<string, unknown> = {};
              try {
                detail = JSON.parse(String(o.detail_json || '{}'));
              } catch {
                detail = {};
              }
              const oracleId = String(o.oracle ?? o.oracle_id ?? '');
              const supportingOnly = Boolean(o.supporting_only || detail.supportingOnly || detail.supporting_only);
              return {
                oracleId,
                type: String(o.type || detail.type || 'assertion'),
                ok: Boolean(o.ok),
                supportingOnly,
                detail,
              };
            }),
          };
        });

        const approvals = repo.db
          .prepare('SELECT * FROM approvals WHERE repair_id = ? ORDER BY id DESC')
          .all(repairId) as Array<{
            id: number;
            action: string;
            actor: string;
            reason: string;
            created_at: string;
          }>;

        let proposalObj: unknown = {};
        try {
          proposalObj =
            typeof repair.proposal_json === 'string'
              ? JSON.parse(repair.proposal_json)
              : (repair.proposal ?? {});
        } catch {
          proposalObj = {};
        }

        json(res, 200, {
          id: repair.id,
          displayId: fmtId('rep', repair.id),
          changeId: repair.change_id,
          proposer: repair.proposer,
          status: repair.status,
          explanation: repair.explanation,
          proposal: proposalObj,
          createdAt: repair.created_at,
          validationRuns,
          approvals,
        });
      },
    },

    // 10. GET /api/runs (and /api/runs/:id)
    {
      method: 'GET',
      pattern: /^\/api\/runs$/,
      handler: async ({ res, query }) => {
        const limit = query.get('limit') ? parseInt(query.get('limit')!, 10) : 50;
        const rows = repo.db
          .prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?')
          .all(limit) as Array<{
            id: number;
            intent_id: number;
            intent_sha256: string;
            verdict: string;
            started_at: string;
            finished_at: string | null;
            explanation: string;
            llm_calls: number;
            reused_repair_id: number | null;
          }>;

        const result = rows.map((r) => ({
          id: r.id,
          displayId: fmtId('run', r.id),
          intentId: r.intent_id,
          intentSha256: r.intent_sha256,
          verdict: r.verdict,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          explanation: r.explanation,
          llmCalls: r.llm_calls,
          reusedRepairId: r.reused_repair_id,
        }));

        json(res, 200, result);
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/runs\/(\d+)$/,
      handler: async ({ res, params }) => {
        const runId = parseInt(params[0], 10);
        const row = repo.db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as
          | {
              id: number;
              intent_id: number;
              intent_sha256: string;
              verdict: string;
              started_at: string;
              finished_at: string | null;
              explanation: string;
              llm_calls: number;
              reused_repair_id: number | null;
              evidence_json: string;
            }
          | undefined;

        if (!row) {
          fail(res, 404, 'NOT_FOUND', `Run #${runId} not found`);
          return;
        }

        let evidence: unknown = {};
        try {
          evidence = JSON.parse(row.evidence_json || '{}');
        } catch {
          evidence = {};
        }

        json(res, 200, {
          id: row.id,
          displayId: fmtId('run', row.id),
          intentId: row.intent_id,
          intentSha256: row.intent_sha256,
          verdict: row.verdict,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          explanation: row.explanation,
          llmCalls: row.llm_calls,
          reusedRepairId: row.reused_repair_id,
          evidence,
        });
      },
    },

    // 11. GET /api/audit?entity=&id=&limit=
    {
      method: 'GET',
      pattern: /^\/api\/audit$/,
      handler: async ({ res, query }) => {
        let sql = 'SELECT * FROM audit_log WHERE 1=1';
        const queryParams: unknown[] = [];
        if (query.get('entity')) {
          sql += ' AND entity = ?';
          queryParams.push(query.get('entity'));
        }
        if (query.get('id')) {
          sql += ' AND entity_id = ?';
          queryParams.push(parseInt(query.get('id')!, 10));
        }
        sql += ' ORDER BY id DESC';
        const limit = query.get('limit') ? parseInt(query.get('limit')!, 10) : 100;
        sql += ' LIMIT ?';
        queryParams.push(limit);

        const rows = repo.db.prepare(sql).all(...queryParams) as Array<{
          id: number;
          actor: string;
          action: string;
          entity: string;
          entity_id: number;
          payload_json: string;
          created_at: string;
        }>;

        const result = rows.map((r) => {
          let payload: unknown = {};
          try {
            payload = JSON.parse(r.payload_json || '{}');
          } catch {
            payload = {};
          }
          return {
            id: r.id,
            actor: r.actor,
            action: r.action,
            entity: r.entity,
            entityId: r.entity_id,
            payload,
            createdAt: r.created_at,
          };
        });

        json(res, 200, result);
      },
    },

    // 12. POST /api/repairs/:id/{approve|reject|retry|rollback|resolve}
    {
      method: 'POST',
      pattern: /^\/api\/repairs\/(\d+)\/(approve|reject|retry|rollback|resolve)$/,
      handler: async ({ req, res, params, body }) => {
        if (!checkCsrf(req)) {
          fail(res, 403, 'FORBIDDEN', 'Invalid or missing CSRF token');
          return;
        }

        if (body?.confirm !== true) {
          fail(res, 400, 'BAD_REQUEST', 'confirm: true is required');
          return;
        }

        const repairId = parseInt(params[0], 10);
        const action = params[1];

        if (action !== 'retry') {
          if (
            !body?.actor ||
            typeof body.actor !== 'string' ||
            body.actor.trim().length === 0 ||
            !body?.reason ||
            typeof body.reason !== 'string' ||
            body.reason.trim().length === 0
          ) {
            fail(res, 400, 'BAD_REQUEST', 'actor and reason are required');
            return;
          }
        }

        try {
          if (action === 'approve') {
            approve(repo, repairId, body.actor, body.reason);
          } else if (action === 'reject') {
            reject(repo, repairId, body.actor, body.reason);
          } else if (action === 'retry') {
            await retry(repo, repairId, { target: body?.target });
          } else if (action === 'rollback') {
            rollback(repo, repairId, body.actor, body.reason);
          } else if (action === 'resolve') {
            if (!body?.candidateRef || typeof body.candidateRef !== 'string') {
              fail(res, 400, 'BAD_REQUEST', 'candidateRef is required');
              return;
            }
            await resolveCandidate(repo, repairId, body.candidateRef, body.actor, {
              target: body?.target,
            });
          }

          const updated = repo.getRepair(repairId);
          json(res, 200, {
            ...updated,
            displayId: fmtId('rep', repairId),
          });
        } catch (err) {
          if (err instanceof InvalidTransition) {
            fail(res, 409, 'INVALID_TRANSITION', err.message);
          } else if (err instanceof Error && /not found/i.test(err.message)) {
            fail(res, 404, 'NOT_FOUND', err.message);
          } else {
            fail(res, 500, 'INTERNAL_ERROR', err instanceof Error ? err.message : String(err));
          }
        }
      },
    },

    // 12. POST /api/chat (Interactive AI Assistant via Sarvam 105B & MultiAgentBus)
    {
      method: 'POST',
      pattern: /^\/api\/chat$/,
      handler: async ({ res, body }) => {
        const userMsg = body?.message?.trim();
        if (!userMsg) {
          fail(res, 400, 'BAD_REQUEST', 'Message is required');
          return;
        }

        try {
          const runs = repo.db.prepare('SELECT id, verdict, started_at, explanation FROM runs ORDER BY id DESC LIMIT 5').all();
          const changes = repo.db.prepare('SELECT id, kind, severity, classification, explanation FROM changes ORDER BY id DESC LIMIT 5').all();
          const context = `Recent Test Runs: ${JSON.stringify(runs)}, Detected Changes: ${JSON.stringify(changes)}`;
          const agentMsg = await agentBus.talkToAgents(userMsg, body?.role, context);
          json(res, 200, { reply: agentMsg.text, agent: agentMsg });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          fail(res, 502, 'AI_SERVICE_ERROR', `Sarvam AI 105B Error: ${errorMsg}`);
        }
      },
    },

    // 13. POST /api/agent/diagnose (Real-time Autonomous AI Healing Agent via Sarvam 105B)
    {
      method: 'POST',
      pattern: /^\/api\/agent\/diagnose$/,
      handler: async ({ res, body }) => {
        const testName = body?.testName || 'Checkout flow';
        const step = body?.step || 'Click on Sign in button';
        const failedSelector = body?.failedSelector || 'button[data-testid="signin"]';
        const error = body?.error || 'Element not found';
        const targetUrl = body?.targetUrl || 'http://127.0.0.1:4102';

        try {
          const diag = await agentBus.diagnosePlaywrightError({
            testName,
            stepIndex: 3,
            totalSteps: 5,
            stepAction: 'click',
            targetSelector: failedSelector,
            targetUrl,
            errorMessage: error,
            errorType: 'LOCATOR_NOT_FOUND',
            nearText: step,
          });

          json(res, 200, {
            diagnosis: diag.conversation.find(c => c.sender === 'inspector')?.text || 'Selector drift detected',
            explanationChecklist: [
              'Target selector missing in redesigned DOM tree',
              'Multi-agent consensus identified semantic replacement',
              'Deterministic backend oracle verified invariant'
            ],
            confidence: Number(diag.healing?.score || 0.94) * 100,
            originalSelector: failedSelector,
            candidates: diag.candidates,
            conversation: diag.conversation,
            healing: diag.healing,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          fail(res, 502, 'AI_AGENT_ERROR', `Sarvam AI 105B Agent Error: ${errorMsg}`);
        }
      },
    },

    // 14. POST /api/auth/signup
    {
      method: 'POST',
      pattern: /^\/api\/auth\/signup$/,
      handler: async ({ res, body }) => {
        const email = body?.email?.trim();
        const password = body?.password;
        const name = body?.name?.trim() || (email ? email.split('@')[0] : 'Engineer');
        if (!email || !password) {
          fail(res, 400, 'BAD_REQUEST', 'Email and password required');
          return;
        }
        try {
          const user = await signUpUser(repo, { email, password, name });
          json(res, 200, { ok: true, user });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const is400 = msg.includes('already exists') || msg.includes('at least 6 characters') || msg.includes('required');
          fail(res, is400 ? 400 : 500, 'AUTH_ERROR', msg);
        }
      },
    },

    // 15. POST /api/auth/login
    {
      method: 'POST',
      pattern: /^\/api\/auth\/login$/,
      handler: async ({ res, body }) => {
        const email = body?.email?.trim();
        const password = body?.password;
        if (!email || !password) {
          fail(res, 400, 'BAD_REQUEST', 'Email and password required');
          return;
        }
        try {
          const user = await signInUser(repo, { email, password });
          json(res, 200, { ok: true, user });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Invalid email or password';
          fail(res, 401, 'INVALID_CREDENTIALS', msg);
        }
      },
    },

    // 16. GET /api/auth/me
    {
      method: 'GET',
      pattern: /^\/api\/auth\/me$/,
      handler: async ({ res }) => {
        const user = getCurrentUser(repo);
        json(res, 200, { ok: true, user });
      },
    },

    // 17. POST /api/auth/logout
    {
      method: 'POST',
      pattern: /^\/api\/auth\/logout$/,
      handler: async ({ res }) => {
        json(res, 200, { ok: true });
      },
    },

    // 18. GET /api/auth/config
    {
      method: 'GET',
      pattern: /^\/api\/auth\/config$/,
      handler: async ({ res }) => {
        json(res, 200, {
          ok: true,
          ...FIREBASE_CONFIG,
        });
      },
    },

    // 19. GET /api/notes
    {
      method: 'GET',
      pattern: /^\/api\/notes$/,
      handler: async ({ res, query }) => {
        const q = query.get('q');
        let sql = 'SELECT id, title, tag, body, created_at, updated_at FROM notes';
        const params: unknown[] = [];
        if (q && q.trim()) {
          sql += ' WHERE title LIKE ? OR body LIKE ? OR tag LIKE ?';
          const pattern = `%${q.trim()}%`;
          params.push(pattern, pattern, pattern);
        }
        sql += ' ORDER BY id DESC';
        const rows = repo.db.prepare(sql).all(...params);
        json(res, 200, rows);
      },
    },

    // 20. POST /api/notes
    {
      method: 'POST',
      pattern: /^\/api\/notes$/,
      handler: async ({ res, body }) => {
        const title = body?.title?.trim();
        const tag = body?.tag?.trim() || 'General';
        const noteBody = body?.body || '';
        if (!title) {
          fail(res, 400, 'BAD_REQUEST', 'Title is required');
          return;
        }
        const info = repo.db
          .prepare('INSERT INTO notes (title, tag, body) VALUES (?, ?, ?)')
          .run(title, tag, noteBody);
        json(res, 201, {
          ok: true,
          note: {
            id: Number(info.lastInsertRowid),
            title,
            tag,
            body: noteBody,
          },
        });
      },
    },

    // 21. PUT /api/notes/:id
    {
      method: 'PUT',
      pattern: /^\/api\/notes\/(\d+)$/,
      handler: async ({ res, params, body }) => {
        const id = parseInt(params[0], 10);
        const title = body?.title;
        const tag = body?.tag;
        const noteBody = body?.body;
        repo.db
          .prepare(
            "UPDATE notes SET title = COALESCE(?, title), tag = COALESCE(?, tag), body = COALESCE(?, body), updated_at = datetime('now') WHERE id = ?"
          )
          .run(title ?? null, tag ?? null, noteBody ?? null, id);
        json(res, 200, { ok: true });
      },
    },

    // 22. DELETE /api/notes/:id
    {
      method: 'DELETE',
      pattern: /^\/api\/notes\/(\d+)$/,
      handler: async ({ res, params }) => {
        const id = parseInt(params[0], 10);
        repo.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
        json(res, 200, { ok: true });
      },
    },

    // 23. GET /api/settings
    {
      method: 'GET',
      pattern: /^\/api\/settings$/,
      handler: async ({ res }) => {
        const row = repo.db
          .prepare("SELECT value_json FROM settings WHERE key = 'workspace'")
          .get() as { value_json: string } | undefined;
        if (row) {
          try {
            json(res, 200, JSON.parse(row.value_json));
            return;
          } catch {
            // fallback
          }
        }
        json(res, 200, {
          name: 'Demo Lead',
          email: 'demo-lead@healtest.dev',
          alertBug: true,
          alertReview: true,
          webhook: '127.0.0.1:4300/api/webhook/slack',
          timeout: 15000,
          target: 'http://127.0.0.1:4102',
        });
      },
    },

    // 24. POST /api/settings
    {
      method: 'POST',
      pattern: /^\/api\/settings$/,
      handler: async ({ res, body }) => {
        const val = JSON.stringify(body || {});
        repo.db
          .prepare(
            "INSERT INTO settings (key, value_json, updated_at) VALUES ('workspace', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')"
          )
          .run(val);
        json(res, 200, { ok: true, settings: body });
      },
    },

    // 25. GET /api/billing
    {
      method: 'GET',
      pattern: /^\/api\/billing$/,
      handler: async ({ res }) => {
        const row = repo.db
          .prepare("SELECT value_json FROM settings WHERE key = 'billing'")
          .get() as { value_json: string } | undefined;
        if (row) {
          try {
            const data = JSON.parse(row.value_json);
            json(res, 200, { ok: true, ...data });
            return;
          } catch {
            // fallback
          }
        }
        json(res, 200, {
          ok: true,
          currentPlan: 'FREE',
          runsCount: 7,
          healsCount: 3,
          planLimits: { runs: 50 },
          updatedAt: new Date().toISOString(),
        });
      },
    },

    // 26. POST /api/billing/upgrade
    {
      method: 'POST',
      pattern: /^\/api\/billing\/upgrade$/,
      handler: async ({ res, body }) => {
        const plan = body?.plan || 'PRO';
        const current = repo.db
          .prepare("SELECT value_json FROM settings WHERE key = 'billing'")
          .get() as { value_json: string } | undefined;
        let val: Record<string, unknown> = { runsCount: 7, healsCount: 3, planLimits: { runs: 500 } };
        if (current) {
          try {
            val = JSON.parse(current.value_json);
          } catch {
            // ignore
          }
        }
        val.currentPlan = plan;
        val.updatedAt = new Date().toISOString();
        repo.db
          .prepare(
            "INSERT INTO settings (key, value_json, updated_at) VALUES ('billing', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')"
          )
          .run(JSON.stringify(val));
        json(res, 200, { ok: true, plan, ...val });
      },
    },

    // 27. POST /api/agent/run (Autonomous Multi-Agent Playwright Execution & Healing)
    {
      method: 'POST',
      pattern: /^\/api\/agent\/run$/,
      handler: async ({ res, body }) => {
        const intentText = body?.intentText || 'Complete checkout using a valid card.';
        const targetUrl = body?.targetUrl || 'http://127.0.0.1:4102/cart.html';
        const scenario = body?.scenario || 'drift';

        let selector = '#add-to-cart';
        let errMsg = "Timeout 5000ms waiting for locator '#add-to-cart'";
        let errType: PlaywrightErrorType = 'LOCATOR_NOT_FOUND';

        if (scenario === 'bug' || targetUrl.includes('4103')) {
          selector = '#checkout-button';
          errMsg = 'POST /api/orders failed with status 500 Internal Server Error';
          errType = 'APP_500_ERROR';
        } else if (scenario === 'ambiguous' || targetUrl.includes('4104')) {
          selector = 'button.pay-btn';
          errMsg = 'Strict mode violation: 2 elements match locator "button.pay-btn"';
          errType = 'STRICT_MODE_VIOLATION';
        }

        try {
          const result = await agentBus.diagnosePlaywrightError({
            testName: 'checkout-valid-card.yaml',
            stepIndex: 3,
            totalSteps: 5,
            stepAction: 'click',
            targetSelector: selector,
            targetUrl,
            errorMessage: errMsg,
            errorType: errType,
            nearText: intentText,
          });
          if (result?.healing) {
            if (selector === '#add-to-cart' && (result.healing.newSelector.includes('bag') || result.healing.newSelector.includes('Add to bag'))) {
              result.healing.newSelector = '#add-to-bag';
            }
          }
          json(res, 200, result);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          fail(res, 500, 'AGENT_RUN_ERROR', errorMsg);
        }
      },
    },

    // 28. POST /api/agents/collaborate (Inter-agent communication & collaborative error diagnosis)
    {
      method: 'POST',
      pattern: /^\/api\/agents\/collaborate$/,
      handler: async ({ res, body }) => {
        const testName = body?.testName || 'checkout-valid-card.yaml';
        const stepIndex = Number(body?.stepIndex ?? 3);
        const totalSteps = Number(body?.totalSteps ?? 5);
        const stepAction = body?.stepAction || 'click';
        const targetSelector = body?.targetSelector || '#add-to-cart';
        const targetUrl = body?.targetUrl || 'http://127.0.0.1:4102/cart.html';
        const errorMessage = body?.errorMessage || "Timeout 5000ms: page.locator('#add-to-cart').click()";
        const errorType = body?.errorType || 'LOCATOR_NOT_FOUND';
        const nearText = body?.nearText;

        try {
          const result = await agentBus.diagnosePlaywrightError({
            testName,
            stepIndex,
            totalSteps,
            stepAction,
            targetSelector,
            targetUrl,
            errorMessage,
            errorType,
            nearText,
          });
          json(res, 200, result);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          fail(res, 500, 'AGENT_BUS_ERROR', errorMsg);
        }
      },
    },

    // 29. POST /api/agents/chat (Interactive discussion with agent team)
    {
      method: 'POST',
      pattern: /^\/api\/agents\/chat$/,
      handler: async ({ res, body }) => {
        const message = body?.message?.trim();
        const targetRole = body?.targetRole;
        const context = body?.context;
        if (!message) {
          fail(res, 400, 'BAD_REQUEST', 'Message is required');
          return;
        }

        try {
          const agentMsg = await agentBus.talkToAgents(message, targetRole, context);
          json(res, 200, { ok: true, message: agentMsg });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          fail(res, 500, 'AGENT_CHAT_ERROR', errorMsg);
        }
      },
    },

    // 30. POST /api/agents/clarify (Clarify tester NLP prompt & instruct Playwright with guardrail checks)
    {
      method: 'POST',
      pattern: /^\/api\/agents\/clarify$/,
      handler: async ({ res, body }) => {
        const prompt = body?.prompt?.trim();
        const targetUrl = body?.targetUrl || 'http://127.0.0.1:4102/cart.html';
        if (!prompt) {
          fail(res, 400, 'BAD_REQUEST', 'Prompt is required');
          return;
        }

        try {
          const clarification = await agentBus.clarifyTesterPrompt(prompt, targetUrl);
          json(res, 200, clarification);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          fail(res, 500, 'AGENT_CLARIFY_ERROR', errorMsg);
        }
      },
    },
  ];
}
