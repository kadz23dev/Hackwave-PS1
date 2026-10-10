import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../../src/db/index.js';
import { Repo } from '../../src/db/repo.js';

export function tempDb(): { db: Database.Database; repo: Repo; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'healtest-'));
  const path = join(dir, 'test.sqlite');
  const db = openDb(path);
  const repo = new Repo(db);
  return { db, repo, path };
}
