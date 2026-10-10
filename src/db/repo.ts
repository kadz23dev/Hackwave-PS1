import type Database from 'better-sqlite3';

function tryParse(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

export interface SnapshotInput {
  contentHash?: string;
  content_hash?: string;
  elements?: unknown[];
  dom?: unknown;
  dom_json?: string;
  ariaYaml?: string;
  a11y?: unknown;
  a11y_json?: string;
  screenshotPath?: string | null;
  screenshot_path?: string | null;
}

export interface ChangeReportInput {
  baseSnapshotId?: number;
  base_snapshot_id?: number;
  headSnapshotId?: number;
  head_snapshot_id?: number;
  kind: string;
  severity: string;
  classification: string;
  confidence: number;
  evidence?: unknown;
  evidence_json?: string;
  affectedSteps?: unknown;
  affected_steps_json?: string;
  explanation?: string;
}

export interface StepPlanInput {
  intentId?: number;
  intent_id?: number;
  siteId?: number;
  site_id?: number;
  steps?: unknown;
  steps_json?: string;
  origin: string;
  repairId?: number | null;
  repair_id?: number | null;
  startHash?: string;
  start_hash?: string;
}

export interface RepairInput {
  changeId?: number;
  change_id?: number;
  proposer: string;
  proposal?: unknown;
  proposalJson?: string;
  proposal_json?: string;
  status?: string;
  explanation?: string;
  stepPlanId?: number | null;
  step_plan_id?: number | null;
}

export interface OracleResultInput {
  oracle?: string;
  oracleId?: string;
  oracle_id?: string;
  name?: string;
  ok: boolean | number;
  detail?: unknown;
  detail_json?: string;
}

export interface StoredSnapshot {
  id: number;
  pageId: number;
  versionLabel: string;
  dom: unknown;
  elements: unknown;
  a11y: unknown;
  ariaYaml: string;
  screenshotPath: string | null;
  contentHash: string;
  capturedAt: string;
  pagePath?: string;
}

export interface StoredKnownGood {
  id: number;
  page_id: number;
  snapshot_id: number;
  repair_id: number | null;
  step_plan_id: number | null;
  set_at: string;
  steps_json?: string;
  start_hash?: string;
  steps?: unknown;
}

export interface StoredChange {
  id: number;
  base_snapshot_id: number;
  head_snapshot_id: number;
  kind: string;
  severity: string;
  classification: string;
  confidence: number;
  evidence_json: string;
  affected_steps_json: string;
  explanation: string;
  created_at: string;
  evidence: unknown;
  affectedSteps: unknown;
}

export interface StoredAuditLog {
  id: number;
  ts: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: number | null;
  payload_json: string;
  payload: unknown;
}

export class Repo {
  constructor(public db: Database.Database) {}

  private tx<T>(actor: string, action: string, entity: string, fn: () => { id: number; payload?: unknown; result: T }): T {
    const runInTransaction = this.db.transaction(() => {
      const { id, payload, result } = fn();
      const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
      this.db.prepare(
        'INSERT INTO audit_log(actor, action, entity, entity_id, payload_json) VALUES (?, ?, ?, ?, ?)'
      ).run(actor, action, entity, id, payloadJson);
      return result;
    });
    return runInTransaction();
  }

  upsertSite(name: string, baseUrl: string, allowlist: unknown, actor = 'system'): { id: number; name: string; baseUrl: string; allowlist: unknown } {
    const allowlistJson = typeof allowlist === 'string' ? allowlist : JSON.stringify(allowlist ?? []);
    return this.tx(actor, 'site.upsert', 'sites', () => {
      const existing = this.db.prepare(
        'SELECT id, name, base_url, allowlist_json FROM sites WHERE base_url = ? OR name = ?'
      ).get(baseUrl, name) as { id: number; name: string; base_url: string; allowlist_json: string } | undefined;

      if (existing) {
        this.db.prepare('UPDATE sites SET base_url = ?, allowlist_json = ? WHERE id = ?').run(baseUrl, allowlistJson, existing.id);
        return {
          id: existing.id,
          payload: { name, baseUrl },
          result: {
            id: existing.id,
            name: existing.name,
            baseUrl,
            allowlist: tryParse(allowlistJson)
          }
        };
      }

      const info = this.db.prepare(
        'INSERT INTO sites(name, base_url, allowlist_json) VALUES (?, ?, ?)'
      ).run(name, baseUrl, allowlistJson);
      const id = Number(info.lastInsertRowid);
      return {
        id,
        payload: { name, baseUrl },
        result: { id, name, baseUrl, allowlist: tryParse(allowlistJson) }
      };
    });
  }

  upsertPage(siteId: number, path: string, actor = 'system'): { id: number; siteId: number; path: string } {
    return this.tx(actor, 'page.upsert', 'pages', () => {
      const existing = this.db.prepare(
        'SELECT id, site_id, path FROM pages WHERE site_id = ? AND path = ?'
      ).get(siteId, path) as { id: number; site_id: number; path: string } | undefined;

      if (existing) {
        return {
          id: existing.id,
          payload: { siteId, path },
          result: { id: existing.id, siteId: existing.site_id, path: existing.path }
        };
      }

      const info = this.db.prepare(
        'INSERT INTO pages(site_id, path) VALUES (?, ?)'
      ).run(siteId, path);
      const id = Number(info.lastInsertRowid);
      return {
        id,
        payload: { siteId, path },
        result: { id, siteId, path }
      };
    });
  }

  insertSnapshot(pageId: number, versionLabel: string, snap: SnapshotInput, actor = 'system'): number {
    const contentHash = snap.contentHash ?? snap.content_hash ?? '';
    const domJson = typeof snap.dom_json === 'string' ? snap.dom_json : JSON.stringify(snap.elements ?? snap.dom ?? []);
    const a11yJson = typeof snap.a11y_json === 'string' ? snap.a11y_json : (typeof snap.ariaYaml === 'string' ? snap.ariaYaml : JSON.stringify(snap.a11y ?? {}));
    const screenshotPath = snap.screenshotPath ?? snap.screenshot_path ?? null;

    const existing = this.db.prepare(
      'SELECT id FROM snapshots WHERE page_id = ? AND content_hash = ?'
    ).get(pageId, contentHash) as { id: number } | undefined;

    if (existing) {
      return this.tx(actor, 'snapshot.dedup', 'snapshots', () => {
        return { id: existing.id, payload: { pageId, contentHash, versionLabel }, result: existing.id };
      });
    }

    return this.tx(actor, 'snapshot.insert', 'snapshots', () => {
      const info = this.db.prepare(
        'INSERT INTO snapshots(page_id, version_label, dom_json, a11y_json, screenshot_path, content_hash) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(pageId, versionLabel, domJson, a11yJson, screenshotPath, contentHash);
      const id = Number(info.lastInsertRowid);
      return { id, payload: { pageId, contentHash, versionLabel }, result: id };
    });
  }

  getSnapshot(id: number, actor = 'system'): StoredSnapshot | null {
    return this.tx(actor, 'snapshot.get', 'snapshots', () => {
      const row = this.db.prepare(
        'SELECT s.*, p.path AS page_path FROM snapshots s LEFT JOIN pages p ON s.page_id = p.id WHERE s.id = ?'
      ).get(id) as {
        id: number;
        page_id: number;
        version_label: string;
        dom_json: string;
        a11y_json: string;
        screenshot_path: string | null;
        content_hash: string;
        captured_at: string;
        page_path?: string;
      } | undefined;

      if (!row) {
        return { id, payload: { id }, result: null };
      }
      const result: StoredSnapshot = {
        id: row.id,
        pageId: row.page_id,
        versionLabel: row.version_label,
        dom: tryParse(row.dom_json),
        elements: tryParse(row.dom_json),
        a11y: tryParse(row.a11y_json),
        ariaYaml: row.a11y_json,
        screenshotPath: row.screenshot_path,
        contentHash: row.content_hash,
        capturedAt: row.captured_at,
        pagePath: row.page_path ?? '',
      };
      return { id, payload: { id }, result };
    });
  }

  upsertIntentVersion(name: string, sha: string, body: string, actor = 'system'): { id: number; name: string; sha256: string; body: string } {
    return this.tx(actor, 'intent.upsert', 'intents', () => {
      const existing = this.db.prepare(
        'SELECT id, name, sha256, body FROM intents WHERE sha256 = ?'
      ).get(sha) as { id: number; name: string; sha256: string; body: string } | undefined;

      if (existing) {
        return {
          id: existing.id,
          payload: { name, sha },
          result: existing
        };
      }

      const info = this.db.prepare(
        'INSERT INTO intents(name, sha256, body) VALUES (?, ?, ?)'
      ).run(name, sha, body);
      const id = Number(info.lastInsertRowid);
      return {
        id,
        payload: { name, sha },
        result: { id, name, sha256: sha, body }
      };
    });
  }

  insertRun(
    opts: { intentId: number; snapshotId?: number | null; intentSha: string; kind?: string; targetOrigin?: string },
    actor = 'system'
  ): number {
    return this.tx(actor, 'run.insert', 'runs', () => {
      const startedAt = new Date().toISOString();
      const kind = opts.kind ?? 'run';
      const targetOrigin = opts.targetOrigin ?? '';
      const info = this.db.prepare(
        `INSERT INTO runs(intent_id, snapshot_id, intent_sha256, verdict, started_at, kind, target_origin)
         VALUES (?, ?, ?, 'FAIL_UNREPAIRABLE', ?, ?, ?)`
      ).run(opts.intentId, opts.snapshotId ?? null, opts.intentSha, startedAt, kind, targetOrigin);
      const id = Number(info.lastInsertRowid);
      return { id, payload: { ...opts, startedAt }, result: id };
    });
  }

  finishRun(
    runId: number,
    opts: {
      verdict: string;
      explanation?: string;
      llmCalls?: number;
      evidence?: unknown;
      reusedRepairId?: number | null;
    },
    actor = 'system'
  ): boolean {
    return this.tx(actor, 'run.finish', 'runs', () => {
      const finishedAt = new Date().toISOString();
      const evidenceJson = typeof opts.evidence === 'string' ? opts.evidence : JSON.stringify(opts.evidence ?? {});
      this.db.prepare(
        'UPDATE runs SET verdict = ?, finished_at = ?, explanation = ?, llm_calls = ?, evidence_json = ?, reused_repair_id = ? WHERE id = ?'
      ).run(
        opts.verdict,
        finishedAt,
        opts.explanation ?? '',
        opts.llmCalls ?? 0,
        evidenceJson,
        opts.reusedRepairId ?? null,
        runId
      );
      return { id: runId, payload: { ...opts, finishedAt }, result: true };
    });
  }

  insertChange(report: ChangeReportInput, actor = 'system'): number {
    return this.tx(actor, 'change.insert', 'changes', () => {
      const evidenceJson = typeof report.evidence === 'string'
        ? report.evidence
        : JSON.stringify(report.evidence ?? report.evidence_json ?? []);
      const stepsJson = typeof report.affectedSteps === 'string'
        ? report.affectedSteps
        : JSON.stringify(report.affectedSteps ?? report.affected_steps_json ?? []);
      const info = this.db.prepare(
        `INSERT INTO changes(base_snapshot_id, head_snapshot_id, kind, severity, classification, confidence, evidence_json, affected_steps_json, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        report.baseSnapshotId ?? report.base_snapshot_id,
        report.headSnapshotId ?? report.head_snapshot_id,
        report.kind,
        report.severity,
        report.classification,
        report.confidence,
        evidenceJson,
        stepsJson,
        report.explanation ?? ''
      );
      const id = Number(info.lastInsertRowid);
      return { id, payload: { kind: report.kind, severity: report.severity }, result: id };
    });
  }

  getChange(id: number, actor = 'system'): StoredChange | null {
    return this.tx(actor, 'change.get', 'changes', () => {
      const row = this.db.prepare('SELECT * FROM changes WHERE id = ?').get(id) as {
        id: number;
        base_snapshot_id: number;
        head_snapshot_id: number;
        kind: string;
        severity: string;
        classification: string;
        confidence: number;
        evidence_json: string;
        affected_steps_json: string;
        explanation: string;
        created_at: string;
      } | undefined;

      if (!row) {
        return { id, payload: { id }, result: null };
      }

      const result: StoredChange = {
        ...row,
        evidence: tryParse(row.evidence_json),
        affectedSteps: tryParse(row.affected_steps_json)
      };
      return { id, payload: { id }, result };
    });
  }

  insertStepPlan(plan: StepPlanInput, actor = 'system'): number {
    return this.tx(actor, 'plan.insert', 'step_plans', () => {
      const stepsJson = typeof plan.steps === 'string'
        ? plan.steps
        : JSON.stringify(plan.steps ?? plan.steps_json ?? []);
      const info = this.db.prepare(
        `INSERT INTO step_plans(intent_id, site_id, steps_json, origin, repair_id, start_hash)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        plan.intentId ?? plan.intent_id,
        plan.siteId ?? plan.site_id,
        stepsJson,
        plan.origin,
        plan.repairId ?? plan.repair_id ?? null,
        plan.startHash ?? plan.start_hash
      );
      const id = Number(info.lastInsertRowid);
      return { id, payload: { origin: plan.origin, startHash: plan.startHash ?? plan.start_hash }, result: id };
    });
  }

  insertRepair(repair: RepairInput, actor = 'system'): number {
    const status = repair.status ?? 'proposed';
    if (['validated', 'approved', 'applied'].includes(status)) {
      throw new Error('repair requires passing validation_run');
    }
    return this.tx(actor, 'repair.insert', 'repairs', () => {
      const proposalJson = typeof repair.proposalJson === 'string'
        ? repair.proposalJson
        : JSON.stringify(repair.proposal ?? repair.proposalJson ?? repair.proposal_json ?? {});
      const explanation = repair.explanation ?? '';
      const stepPlanId = repair.stepPlanId ?? repair.step_plan_id ?? null;
      const info = this.db.prepare(
        `INSERT INTO repairs(change_id, proposer, proposal_json, status, explanation, step_plan_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        repair.changeId ?? repair.change_id,
        repair.proposer,
        proposalJson,
        status,
        explanation,
        stepPlanId
      );
      const id = Number(info.lastInsertRowid);
      return { id, payload: { changeId: repair.changeId ?? repair.change_id, status, proposer: repair.proposer }, result: id };
    });
  }

  setRepairStatus(repairId: number, status: string, actor: string, reason?: string): boolean {
    return this.tx(actor, 'repair.set_status', 'repairs', () => {
      this.db.prepare('UPDATE repairs SET status = ? WHERE id = ?').run(status, repairId);
      return { id: repairId, payload: { status, reason: reason ?? '' }, result: true };
    });
  }

  insertValidationRun(repairId: number, runId: number, verdict: string, oracleSummary: unknown, actor = 'system'): number {
    return this.tx(actor, 'validation_run.insert', 'validation_runs', () => {
      const summaryJson = typeof oracleSummary === 'string'
        ? oracleSummary
        : JSON.stringify(oracleSummary ?? {});
      const info = this.db.prepare(
        'INSERT INTO validation_runs(repair_id, run_id, verdict, oracle_summary_json) VALUES (?, ?, ?, ?)'
      ).run(repairId, runId, verdict, summaryJson);
      const id = Number(info.lastInsertRowid);
      return { id, payload: { repairId, runId, verdict }, result: id };
    });
  }

  insertOracleResults(validationRunId: number, results: OracleResultInput[], actor = 'system'): number {
    return this.tx(actor, 'oracle_results.insert', 'oracle_results', () => {
      for (const r of results) {
        const oracleName = r.oracle ?? r.oracleId ?? r.oracle_id ?? r.name ?? '';
        const okVal = r.ok ? 1 : 0;
        const detailJson = typeof r.detail === 'string'
          ? r.detail
          : JSON.stringify(r.detail ?? r.detail_json ?? {});
        this.db.prepare(
          'INSERT INTO oracle_results(validation_run_id, oracle, ok, detail_json) VALUES (?, ?, ?, ?)'
        ).run(validationRunId, oracleName, okVal, detailJson);
      }
      return { id: validationRunId, payload: { count: results.length }, result: results.length };
    });
  }

  insertApproval(repairId: number, decision: string, actor: string, reason: string): number {
    return this.tx(actor, 'approval.insert', 'approvals', () => {
      const info = this.db.prepare(
        'INSERT INTO approvals(repair_id, decision, actor, reason) VALUES (?, ?, ?, ?)'
      ).run(repairId, decision, actor, reason);
      const id = Number(info.lastInsertRowid);
      return { id, payload: { repairId, decision, reason }, result: id };
    });
  }

  insertKnownGood(pageId: number, snapshotId: number, repairId?: number | null, stepPlanId?: number | null, actor = 'system'): number {
    return this.tx(actor, 'known_good.insert', 'known_good', () => {
      const info = this.db.prepare(
        'INSERT INTO known_good(page_id, snapshot_id, repair_id, step_plan_id) VALUES (?, ?, ?, ?)'
      ).run(pageId, snapshotId, repairId ?? null, stepPlanId ?? null);
      const id = Number(info.lastInsertRowid);
      return { id, payload: { pageId, snapshotId, repairId, stepPlanId }, result: id };
    });
  }

  currentKnownGood(intentId?: number, siteId?: number, actor = 'system'): StoredKnownGood | null {
    return this.tx(actor, 'known_good.current', 'known_good', () => {
      let row: {
        id: number;
        page_id: number;
        snapshot_id: number;
        repair_id: number | null;
        step_plan_id: number | null;
        set_at: string;
        steps_json?: string;
        start_hash?: string;
      } | undefined;

      if (intentId != null && siteId != null) {
        row = this.db.prepare(`
          SELECT kg.*, sp.steps_json, sp.start_hash
          FROM known_good kg
          JOIN step_plans sp ON kg.step_plan_id = sp.id
          WHERE sp.intent_id = ? AND sp.site_id = ?
          ORDER BY kg.id DESC LIMIT 1
        `).get(intentId, siteId) as typeof row;

        if (!row) {
          row = this.db.prepare(`
            SELECT kg.*, sp.steps_json, sp.start_hash
            FROM known_good kg
            LEFT JOIN step_plans sp ON kg.step_plan_id = sp.id
            JOIN pages p ON kg.page_id = p.id
            WHERE p.site_id = ?
            ORDER BY kg.id DESC LIMIT 1
          `).get(siteId) as typeof row;
        }
      } else {
        row = this.db.prepare('SELECT * FROM known_good ORDER BY id DESC LIMIT 1').get() as typeof row;
      }

      const result: StoredKnownGood | null = row ? {
        ...row,
        steps: row.steps_json ? tryParse(row.steps_json) : undefined
      } : null;
      return { id: row?.id ?? 0, payload: { intentId, siteId }, result };
    });
  }

  listChanges(filter: { severity?: string; classification?: string; limit?: number } = {}, actor = 'system'): StoredChange[] {
    return this.tx(actor, 'change.list', 'changes', () => {
      let query = 'SELECT * FROM changes WHERE 1=1';
      const params: unknown[] = [];
      if (filter.severity) {
        query += ' AND severity = ?';
        params.push(filter.severity);
      }
      if (filter.classification) {
        query += ' AND classification = ?';
        params.push(filter.classification);
      }
      query += ' ORDER BY id DESC';
      if (filter.limit) {
        query += ' LIMIT ?';
        params.push(filter.limit);
      }
      const rows = this.db.prepare(query).all(...params) as Array<{
        id: number;
        base_snapshot_id: number;
        head_snapshot_id: number;
        kind: string;
        severity: string;
        classification: string;
        confidence: number;
        evidence_json: string;
        affected_steps_json: string;
        explanation: string;
        created_at: string;
      }>;
      const result: StoredChange[] = rows.map(r => ({
        ...r,
        evidence: tryParse(r.evidence_json),
        affectedSteps: tryParse(r.affected_steps_json)
      }));
      return { id: 0, payload: filter, result };
    });
  }

  listAudit(filter: { entity?: string; entityId?: number; limit?: number } = {}, actor = 'system'): StoredAuditLog[] {
    return this.tx(actor, 'audit.list', 'audit_log', () => {
      let query = 'SELECT * FROM audit_log WHERE 1=1';
      const params: unknown[] = [];
      if (filter.entity) {
        query += ' AND entity = ?';
        params.push(filter.entity);
      }
      if (filter.entityId != null) {
        query += ' AND entity_id = ?';
        params.push(filter.entityId);
      }
      query += ' ORDER BY id DESC';
      if (filter.limit) {
        query += ' LIMIT ?';
        params.push(filter.limit);
      }
      const rows = this.db.prepare(query).all(...params) as Array<{
        id: number;
        ts: string;
        actor: string;
        action: string;
        entity: string;
        entity_id: number | null;
        payload_json: string;
      }>;
      const result: StoredAuditLog[] = rows.map(r => ({
        ...r,
        payload: tryParse(r.payload_json)
      }));
      return { id: 0, payload: filter, result };
    });
  }
}
