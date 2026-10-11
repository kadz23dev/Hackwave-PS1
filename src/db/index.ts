import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HOME } from '../config.js';

export function openDb(path?: string): Database.Database {
  const dbPath = path ?? process.env.HEALTEST_DB_PATH ?? join(HOME, 'healtest.sqlite');
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY)');

  const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const getMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = ?');
  const insertMigration = db.prepare('INSERT INTO schema_migrations(version) VALUES (?)');

  for (const file of files) {
    const existing = getMigration.get(file);
    if (!existing) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      const applyMigration = db.transaction(() => {
        db.exec(sql);
        insertMigration.run(file);
      });
      applyMigration();
    }
  }

  return db;
}
