import { createReadStream, existsSync } from 'node:fs';
import { type Route, json, fail } from './http.js';
import { csrfToken, check as checkCsrf } from './csrf.js';
import type { Repo } from '../db/repo.js';
import {
  approve,
  reject,
  retry,
  rollback,
  resolveCandidate,
  InvalidTransition,
} from '../governance/approvals.js';
import type { ElementRecord } from '../types.js';

export function fmtId(prefix: string, n: number | string): string {
  const num = typeof n === 'number' ? n : parseInt(String(n), 10);
  return isNaN(num) ? `${prefix}_${n}` : `${prefix}_${String(num).padStart(4, '0')}`;
}

export function buildRoutes(repo: Repo): Route[] {
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
          sql += ' AND severity = ?';
          queryParams.push(query.get('severity'));
        }
        if (query.get('classification')) {
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
            .all(vr.id) as Array<{
              id: number;
              oracle_id: string;
              type: string;
              ok: number;
              supporting_only: number;
              detail_json: string;
            }>;

          return {
            id: vr.id,
            runId: vr.run_id,
            verdict: vr.verdict,
            summary: JSON.parse(vr.summary_json || '{}'),
            createdAt: vr.created_at,
            oracleResults: oracles.map((o) => ({
              oracleId: o.oracle_id,
              type: o.type,
              ok: Boolean(o.ok),
              supportingOnly: Boolean(o.supporting_only),
              detail: JSON.parse(o.detail_json || '{}'),
            })),
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
  ];
}
