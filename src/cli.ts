#!/usr/bin/env node
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/index.js';
import { Repo } from './db/repo.js';
import { diffSnapshots } from './diff/differ.js';
import type { ElementRecord, PageSnapshot } from './types.js';

export const program = new Command();

program
  .name('healtest')
  .description('Intent-aware self-healing end-to-end testing tool')
  .version('1.0.0');

program
  .command('diff')
  .description('Compare two stored snapshots and print detected changes')
  .argument('<baseId>', 'Base snapshot ID')
  .argument('<headId>', 'Head snapshot ID')
  .option('--json', 'Output full change items as JSON')
  .option('--db <path>', 'Custom path to SQLite database')
  .action((baseIdStr: string, headIdStr: string, options: { json?: boolean; db?: string }) => {
    const baseId = parseInt(baseIdStr, 10);
    const headId = parseInt(headIdStr, 10);

    const db = openDb(options.db);
    const repo = new Repo(db);

    const baseRaw = repo.getSnapshot(baseId);
    const headRaw = repo.getSnapshot(headId);

    if (!baseRaw || !headRaw) {
      console.error(`Error: snapshot ${!baseRaw ? baseId : headId} not found`);
      process.exit(1);
    }

    const basePathRow = db
      .prepare('SELECT path FROM pages WHERE id = ?')
      .get(baseRaw.pageId) as { path: string } | undefined;
    const headPathRow = db
      .prepare('SELECT path FROM pages WHERE id = ?')
      .get(headRaw.pageId) as { path: string } | undefined;

    const base: PageSnapshot = {
      id: baseRaw.id,
      pagePath: basePathRow?.path ?? '',
      url: '',
      title: '',
      headings: [],
      elements: (Array.isArray(baseRaw.elements) ? baseRaw.elements : []) as ElementRecord[],
      ariaYaml: baseRaw.ariaYaml ?? '',
      contentHash: baseRaw.contentHash ?? '',
      screenshotPath: baseRaw.screenshotPath ?? null,
    };

    const head: PageSnapshot = {
      id: headRaw.id,
      pagePath: headPathRow?.path ?? '',
      url: '',
      title: '',
      headings: [],
      elements: (Array.isArray(headRaw.elements) ? headRaw.elements : []) as ElementRecord[],
      ariaYaml: headRaw.ariaYaml ?? '',
      contentHash: headRaw.contentHash ?? '',
      screenshotPath: headRaw.screenshotPath ?? null,
    };

    const items = diffSnapshots(base, head);

    if (options.json) {
      console.log(JSON.stringify(items, null, 2));
    } else {
      for (const item of items) {
        console.log(`${item.kind} ${item.evidence}`);
      }
    }
  });

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('cli.js') ||
    process.argv[1].endsWith('cli.ts'));

if (isMain) {
  program.parseAsync(process.argv).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
