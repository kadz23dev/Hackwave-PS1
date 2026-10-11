#!/usr/bin/env node

import { Command } from 'commander';
import { openDb } from './db/index.js';
import { Repo } from './db/repo.js';
import { diffSnapshots } from './diff/differ.js';
import { runIntent } from './pipeline/run.js';
import { runValidation } from './validate/validation.js';
import { exitCodeFor } from './classify/verdict.js';
import { approve, reject, resolveCandidate, rollback } from './governance/approvals.js';
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

program
  .command('run <intent>')
  .description('Run an intent test against a target URL')
  .requiredOption('--target <url>', 'Target base URL')
  .option('--db <path>', 'Path to SQLite database')
  .option('--llm <mode>', 'LLM mode (off, record, replay, live)', 'off')
  .action(async (intentPath: string, opts: { target: string; db?: string; llm?: string }) => {
    try {
      const outcome = await runIntent(intentPath, opts.target, {
        db: opts.db,
        llm: opts.llm,
      });
      process.exitCode = outcome.exitCode;
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  });

program
  .command('validate <repairId>')
  .description('Run validation on a repair proposal')
  .option('--db <path>', 'Path to SQLite database')
  .option('--target <url>', 'Target base URL')
  .action(async (repairIdStr: string, opts: { db?: string; target?: string }) => {
    try {
      const repairId = parseInt(repairIdStr, 10);
      const db = openDb(opts.db);
      const repo = new Repo(db);
      const outcome = await runValidation(repo, repairId, { target: opts.target });
      process.exitCode = exitCodeFor(outcome.verdict);
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  });

program
  .command('approve <repairId>')
  .description('Approve a validated repair and apply it to known-good')
  .requiredOption('--actor <actor>', 'Actor performing approval')
  .requiredOption('--reason <reason>', 'Reason for approval')
  .option('--db <path>', 'Path to SQLite database')
  .action((repairIdStr: string, opts: { actor: string; reason: string; db?: string }) => {
    try {
      const repairId = parseInt(repairIdStr, 10);
      const db = openDb(opts.db);
      const repo = new Repo(db);
      approve(repo, repairId, opts.actor, opts.reason);
      console.log(`[approve] repair rep_${repairId} approved and applied by ${opts.actor}`);
      process.exitCode = 0;
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  });

program
  .command('reject <repairId>')
  .description('Reject a repair proposal')
  .requiredOption('--actor <actor>', 'Actor performing rejection')
  .requiredOption('--reason <reason>', 'Reason for rejection')
  .option('--db <path>', 'Path to SQLite database')
  .action((repairIdStr: string, opts: { actor: string; reason: string; db?: string }) => {
    try {
      const repairId = parseInt(repairIdStr, 10);
      const db = openDb(opts.db);
      const repo = new Repo(db);
      reject(repo, repairId, opts.actor, opts.reason);
      console.log(`[reject] repair rep_${repairId} rejected by ${opts.actor}`);
      process.exitCode = 0;
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  });

program
  .command('resolve <repairId>')
  .description('Resolve an ambiguous repair proposal by choosing a candidate')
  .requiredOption('--candidate <ref>', 'Chosen candidate element ref')
  .requiredOption('--actor <actor>', 'Actor resolving the candidate')
  .option('--reason <reason>', 'Reason for candidate resolution', 'human resolution')
  .option('--db <path>', 'Path to SQLite database')
  .option('--target <url>', 'Target base URL')
  .action(async (repairIdStr: string, opts: { candidate: string; actor: string; reason?: string; db?: string; target?: string }) => {
    try {
      const repairId = parseInt(repairIdStr, 10);
      const db = openDb(opts.db);
      const repo = new Repo(db);
      const result = await resolveCandidate(repo, repairId, opts.candidate, opts.actor, { target: opts.target });
      console.log(`[resolve] repair rep_${repairId} resolved with candidate ${opts.candidate} → verdict ${result.verdict}`);
      process.exitCode = result.verdict === 'PASS' || result.verdict === 'HEALED_PASS' ? 0 : (result.verdict === 'APP_BUG' ? 10 : 11);
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  });

program
  .command('rollback <repairId>')
  .description('Rollback an applied repair to previous known-good plan')
  .requiredOption('--actor <actor>', 'Actor performing rollback')
  .requiredOption('--reason <reason>', 'Reason for rollback')
  .option('--db <path>', 'Path to SQLite database')
  .action((repairIdStr: string, opts: { actor: string; reason: string; db?: string }) => {
    try {
      const repairId = parseInt(repairIdStr, 10);
      const db = openDb(opts.db);
      const repo = new Repo(db);
      rollback(repo, repairId, opts.actor, opts.reason);
      console.log(`[rollback] repair rep_${repairId} rolled back by ${opts.actor}`);
      process.exitCode = 0;
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  });

program
  .command('report <runId>')
  .description('Display execution report for a run')
  .option('--json', 'Output report as JSON')
  .option('--db <path>', 'Path to SQLite database')
  .action((runIdStr: string, opts: { json?: boolean; db?: string }) => {
    const runId = parseInt(runIdStr, 10);
    const db = openDb(opts.db);

    const runRow = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as
      | {
          id: number;
          intent_id: number;
          intent_sha256: string;
          verdict: string;
          started_at: string;
          finished_at: string | null;
          explanation: string;
          llm_calls: number;
          evidence_json: string;
          reused_repair_id: number | null;
        }
      | undefined;

    if (!runRow) {
      console.error(`Error: Run #${runId} not found.`);
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(runRow, null, 2));
    } else {
      console.log(`Run #${runRow.id}: ${runRow.verdict}`);
      console.log(`Started: ${runRow.started_at}`);
      console.log(`Finished: ${runRow.finished_at ?? 'in-progress'}`);
      console.log(`Explanation: ${runRow.explanation}`);
      console.log(`LLM Calls: ${runRow.llm_calls}`);
    }
  });

await program.parseAsync(process.argv);
