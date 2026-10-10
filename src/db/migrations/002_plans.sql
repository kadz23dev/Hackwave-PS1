ALTER TABLE runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'run' CHECK (kind IN ('run','validation'));
ALTER TABLE runs ADD COLUMN target_origin TEXT NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN llm_calls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN reused_repair_id INTEGER REFERENCES repairs(id);
ALTER TABLE runs ADD COLUMN explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '{}';   -- network log, step results

CREATE TABLE step_plans(
  id INTEGER PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES intents(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  steps_json TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('baseline','repair')),
  repair_id INTEGER REFERENCES repairs(id),
  start_hash TEXT NOT NULL,                 -- contentHash of startPath page when plan was made
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TRIGGER plans_no_upd BEFORE UPDATE ON step_plans BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER plans_no_del BEFORE DELETE ON step_plans BEGIN SELECT RAISE(ABORT,'append-only'); END;

ALTER TABLE known_good ADD COLUMN step_plan_id INTEGER REFERENCES step_plans(id);
ALTER TABLE repairs ADD COLUMN step_plan_id INTEGER REFERENCES step_plans(id);
