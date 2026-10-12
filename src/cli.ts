#!/usr/bin/env node

import { resolve } from 'node:path';
import { Command } from 'commander';
import { openDb } from './db/index.js';
import { Repo } from './db/repo.js';
import { diffSnapshots } from './diff/differ.js';
import { runIntent } from './pipeline/run.js';
import { runValidation } from './validate/validation.js';
import { exitCodeFor } from './classify/verdict.js';
import { approve, reject, resolveCandidate, rollback } from './governance/approvals.js';
import { openSession } from './browser/session.js';
import { captureSnapshot } from './snapshot/capture.js';
import { findReplacement } from './match/matcher.js';
import { elementToTarget } from './match/score.js';
import { loadPolicy } from './governance/policy.js';
import { createServer } from './server/http.js';
import { buildRoutes } from './server/api.js';
import type { ChangeItem, ElementRecord, PageSnapshot, Step, TargetFingerprint } from './types.js';

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

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
    try {
      const baseId = parseInt(baseIdStr, 10);
      const headId = parseInt(headIdStr, 10);

      const db = openDb(opts.db);
      const repo = new Repo(db);

      const baseRow = repo.getSnapshot(baseId);
      if (!baseRow) {
        throw new Error(`Base snapshot ${baseId} not found in database.`);
      }

      const headRow = repo.getSnapshot(headId);
      if (!headRow) {
        throw new Error(`Head snapshot ${headId} not found in database.`);
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
      process.exitCode = 0;
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
      process.exitCode = 1;
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
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
      process.exitCode = 1;
    }
  });

program
  .command('scan <site>')
  .description('Capture and store snapshots with screenshots')
  .requiredOption('--target <url>', 'Target base URL')
  .option('--paths [paths...]', 'Paths to scan')
  .option('--db <path>', 'Path to SQLite database')
  .action(async (siteName: string, opts: { target: string; paths?: string[]; db?: string }) => {
    try {
      const db = openDb(opts.db);
      const repo = new Repo(db);
      const site = repo.upsertSite(siteName, opts.target, [new URL(opts.target).origin]);

      const rawPaths = opts.paths && opts.paths.length > 0 ? opts.paths : ['/'];
      const paths = rawPaths.map(p => (p.startsWith('/') ? p : `/${p}`));

      const session = await openSession({ headless: true });
      try {
        for (const path of paths) {
          const fullUrl = `${opts.target.replace(/\/$/, '')}${path}`;
          await session.page.goto(fullUrl);
          await session.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

          const snap = await captureSnapshot(session.page, { screenshot: true });
          const page = repo.upsertPage(site.id, path);
          const snapId = repo.insertSnapshot(page.id, 'scan', snap);
          console.log(`[scan] ${path} → snapshot #${snapId}`);
        }
      } finally {
        await session.close();
      }
      process.exitCode = 0;
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
      process.exitCode = 1;
    }
  });

program
  .command('repair <changeId>')
  .description('Re-run matcher for change affected step against head snapshot and propose repair')
  .option('--db <path>', 'Path to SQLite database')
  .action((changeIdStr: string, opts: { db?: string }) => {
    try {
      const changeId = parseInt(changeIdStr, 10);
      const db = openDb(opts.db);
      const repo = new Repo(db);

      const change = repo.getChange(changeId);
      if (!change) {
        throw new Error(`Change chg_${changeId} not found in database.`);
      }

      const headRow = repo.getSnapshot(change.head_snapshot_id);
      if (!headRow) {
        throw new Error(`Head snapshot ${change.head_snapshot_id} not found in database.`);
      }

      const headSnap: PageSnapshot = {
        id: headRow.id,
        pagePath: headRow.pagePath ?? '',
        url: '',
        title: '',
        headings: [],
        elements: (Array.isArray(headRow.elements) ? headRow.elements : []) as ElementRecord[],
        ariaYaml: headRow.ariaYaml ?? '',
        contentHash: headRow.contentHash,
        screenshotPath: headRow.screenshotPath,
      };

      // Load change's affected first step target
      let target: TargetFingerprint | null = null;
      const affectedStepId = Array.isArray(change.affectedSteps) && change.affectedSteps.length > 0
        ? String(change.affectedSteps[0])
        : null;

      if (affectedStepId) {
        const plans = db.prepare('SELECT steps_json FROM step_plans ORDER BY id DESC').all() as { steps_json: string }[];
        for (const p of plans) {
          try {
            const steps = JSON.parse(p.steps_json) as Step[];
            const found = steps.find(s => s.stepId === affectedStepId);
            if (found?.target) {
              target = found.target;
              break;
            }
          } catch {}
        }
      }

      if (!target) {
        const evidence = (Array.isArray(change.evidence) ? change.evidence : []) as ChangeItem[];
        const before = evidence[0]?.before;
        if (before) {
          target = {
            role: before.role ?? 'button',
            name: before.name ?? '',
            tag: before.tag ?? 'button',
            text: before.text ?? before.name ?? '',
            label: before.label ?? '',
            attrs: before.attrs ?? {},
            nearText: before.nearText ?? '',
            bbox: before.bbox ?? { x: 0, y: 0, w: 0, h: 0 },
            selector: before.selector ?? '',
            snapshotId: change.base_snapshot_id,
            ref: before.ref ?? '',
          };
        }
      }

      if (!target) {
        throw new Error(`Unable to determine target element for change chg_${changeId}.`);
      }

      const policy = loadPolicy();
      const match = findReplacement(target, headSnap, policy);

      if (match.kind === 'single') {
        const replacementEl = headSnap.elements.find(e => e.ref === match.best!.ref);
        const newTarget = replacementEl ? elementToTarget(replacementEl, headSnap.id ?? 0) : null;
        const repairId = repo.insertRepair({
          changeId: change.id,
          proposer: 'heuristic',
          proposal: {
            target: newTarget,
            candidate: match.best,
            candidates: match.candidates,
            pendingChoice: null,
          },
          status: 'proposed',
          explanation: `Proposed repair: match '${target.name}' → '${match.best?.name ?? ''}'`,
        });
        console.log(`[repair] change chg_${change.id} proposed repair rep_${repairId}`);
        process.exitCode = 0;
      } else {
        const repairId = repo.insertRepair({
          changeId: change.id,
          proposer: 'heuristic',
          proposal: {
            pendingChoice: {
              stepId: affectedStepId ?? 's1',
              candidates: match.candidates,
            },
          },
          status: 'needs_review',
          explanation: match.kind === 'ambiguous'
            ? `Ambiguous match for '${target.name}': multiple candidates`
            : `No match found for '${target.name}'`,
        });
        console.log(`[repair] change chg_${change.id} ${match.kind} match → needs_review rep_${repairId}`);
        process.exitCode = 11;
      }
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
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
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
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
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
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
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
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
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
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
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
      process.exitCode = 1;
    }
  });

program
  .command('report <runId>')
  .description('Display execution report for a run')
  .option('--json', 'Output report as JSON')
  .option('--db <path>', 'Path to SQLite database')
  .action((runIdStr: string, opts: { json?: boolean; db?: string }) => {
    try {
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
        throw new Error(`Run #${runId} not found.`);
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
      process.exitCode = 0;
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
      process.exitCode = 1;
    }
  });

program
  .command('serve')
  .description('Start HealTest dashboard server and local API')
  .option('--port <port>', 'Port to listen on', '4300')
  .option('--host <host>', 'Host to listen on', '0.0.0.0')
  .option('--db <path>', 'Path to SQLite database')
  .action(async (opts: { port?: string; host?: string; db?: string }) => {
    try {
      const port = parseInt(process.env.PORT || opts.port || '4300', 10);
      const host = process.env.HOST || opts.host || '0.0.0.0';
      const db = openDb(opts.db);
      const repo = new Repo(db);
      const routes = buildRoutes(repo);
      const staticDir = resolve('dashboard');
      const server = createServer(routes, staticDir);

      server.listen(port, host, () => {
        console.log(`HealTest dashboard: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
      });
      await new Promise(() => {});
    } catch (e) {
      console.error(`error: ${errMessage(e)}`);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
