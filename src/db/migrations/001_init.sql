CREATE TABLE sites(id INTEGER PRIMARY KEY, name TEXT NOT NULL, base_url TEXT NOT NULL UNIQUE,
  allowlist_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE pages(id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES sites(id),
  path TEXT NOT NULL, UNIQUE(site_id, path));
CREATE TABLE snapshots(id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL REFERENCES pages(id),
  version_label TEXT NOT NULL, dom_json TEXT NOT NULL, a11y_json TEXT NOT NULL, screenshot_path TEXT,
  content_hash TEXT NOT NULL, captured_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE intents(id INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 TEXT NOT NULL UNIQUE, body TEXT NOT NULL);
CREATE TABLE runs(id INTEGER PRIMARY KEY, intent_id INTEGER NOT NULL REFERENCES intents(id),
  snapshot_id INTEGER REFERENCES snapshots(id), intent_sha256 TEXT NOT NULL, verdict TEXT NOT NULL
  CHECK (verdict IN ('PASS','HEALED_PASS','APP_BUG','NEEDS_REVIEW','FAIL_UNREPAIRABLE')),
  started_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE changes(id INTEGER PRIMARY KEY, base_snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  head_snapshot_id INTEGER NOT NULL REFERENCES snapshots(id), kind TEXT NOT NULL, severity TEXT NOT NULL,
  classification TEXT NOT NULL, confidence REAL NOT NULL, evidence_json TEXT NOT NULL,
  affected_steps_json TEXT NOT NULL, explanation TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE repairs(id INTEGER PRIMARY KEY, change_id INTEGER NOT NULL REFERENCES changes(id),
  proposer TEXT NOT NULL CHECK (proposer IN ('heuristic','llm','reuse')), proposal_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','needs_review','validated','rejected','approved','applied','rolled_back')),
  explanation TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE validation_runs(id INTEGER PRIMARY KEY, repair_id INTEGER NOT NULL REFERENCES repairs(id),
  run_id INTEGER NOT NULL REFERENCES runs(id), verdict TEXT NOT NULL, oracle_summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE oracle_results(id INTEGER PRIMARY KEY, validation_run_id INTEGER NOT NULL REFERENCES validation_runs(id),
  oracle TEXT NOT NULL, ok INTEGER NOT NULL, detail_json TEXT NOT NULL);
CREATE TABLE approvals(id INTEGER PRIMARY KEY, repair_id INTEGER NOT NULL REFERENCES repairs(id),
  decision TEXT NOT NULL CHECK (decision IN ('approve','reject','rollback')), actor TEXT NOT NULL,
  reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE known_good(id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL REFERENCES pages(id),
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id), repair_id INTEGER REFERENCES repairs(id),
  set_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE audit_log(id INTEGER PRIMARY KEY, ts TEXT NOT NULL DEFAULT (datetime('now')), actor TEXT NOT NULL,
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, payload_json TEXT NOT NULL);

-- append-only
CREATE TRIGGER audit_no_upd BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER audit_no_del BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'append-only'); END;
-- (same pair for approvals, validation_runs, oracle_results)
-- a repair cannot be validated/approved/applied without a passing validation run
CREATE TRIGGER repair_needs_validation BEFORE UPDATE OF status ON repairs
WHEN NEW.status IN ('validated','approved','applied')
 AND NOT EXISTS (SELECT 1 FROM validation_runs WHERE repair_id = NEW.id AND verdict IN ('PASS','HEALED_PASS'))
BEGIN SELECT RAISE(ABORT,'repair requires passing validation_run'); END;

CREATE TRIGGER approvals_no_upd BEFORE UPDATE ON approvals BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER approvals_no_del BEFORE DELETE ON approvals BEGIN SELECT RAISE(ABORT,'append-only'); END;

CREATE TRIGGER validation_runs_no_upd BEFORE UPDATE ON validation_runs BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER validation_runs_no_del BEFORE DELETE ON validation_runs BEGIN SELECT RAISE(ABORT,'append-only'); END;

CREATE TRIGGER oracle_results_no_upd BEFORE UPDATE ON oracle_results BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER oracle_results_no_del BEFORE DELETE ON oracle_results BEGIN SELECT RAISE(ABORT,'append-only'); END;
