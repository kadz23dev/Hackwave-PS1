#!/usr/bin/env node

import { Command } from 'commander';
import { openDb } from './db/index.js';
import { Repo } from './db/repo.js';
import { diffSnapshots } from './diff/differ.js';
import type { ElementRecord, PageSnapshot } from './types.js';

export const program = new Command();

program
  .name('healtest')
  .description('Intent-aware self-healing E2E test runner');

program
  .command('diff <baseId> <headId>')
  .description('Diff two snapshots from database')
  .option('--json', 'Output results as JSON')
  .option('--db <path>', 'Path to SQLite database')
  .action((baseIdStr: string, headIdStr: string, opts: { json?: boolean; db?: string }) => {
    const baseId = parseInt(baseIdStr, 10);
    const headId = parseInt(headIdStr, 10);

    const db = openDb(opts.db);
    const repo = new Repo(db);

    const baseRow = repo.getSnapshot(baseId);
    if (!baseRow) {
      console.error(`Base snapshot ${baseId} not found in database.`);
      process.exit(1);
    }

    const headRow = repo.getSnapshot(headId);
    if (!headRow) {
      console.error(`Head snapshot ${headId} not found in database.`);
      process.exit(1);
    }

    const baseSnap: PageSnapshot = {
      id: baseRow.id,
      pagePath: '',
      url: '',
      title: '',
      headings: [],
      elements: (Array.isArray(baseRow.elements) ? baseRow.elements : []) as ElementRecord[],
      ariaYaml: baseRow.ariaYaml ?? '',
      contentHash: baseRow.contentHash,
      screenshotPath: baseRow.screenshotPath,
    };

    const headSnap: PageSnapshot = {
      id: headRow.id,
      pagePath: '',
      url: '',
      title: '',
      headings: [],
      elements: (Array.isArray(headRow.elements) ? headRow.elements : []) as ElementRecord[],
      ariaYaml: headRow.ariaYaml ?? '',
      contentHash: headRow.contentHash,
      screenshotPath: headRow.screenshotPath,
    };

    const items = diffSnapshots(baseSnap, headSnap);

    if (opts.json) {
      console.log(JSON.stringify(items, null, 2));
    } else {
      for (const item of items) {
        console.log(`${item.kind} ${item.evidence}`);
      }
    }
  });

// Execute when run as main CLI entry point
program.parseAsync(process.argv);
