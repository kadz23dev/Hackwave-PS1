ALTER TABLE oracle_results ADD COLUMN oracle_id TEXT GENERATED ALWAYS AS (oracle);
ALTER TABLE oracle_results ADD COLUMN name TEXT GENERATED ALWAYS AS (oracle);
