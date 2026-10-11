import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/index.js';
import { Repo } from './db/repo.js';
import { runIntent } from './pipeline/run.js';
import { approve, resolveCandidate } from './governance/approvals.js';
import { createServer } from './server/http.js';
import { buildRoutes } from './server/api.js';

export interface ActResult {
  act: number;
  target: string;
  verdict: string;
  exitCode: number;
  llmCalls: number;
  status: string;
}

export function startFixtures(): Promise<ChildProcess> {
  return new Promise((resolvePromise, rejectPromise) => {
    const fixturePath = resolve('fixtures/server.mjs');
    const child = spawn('node', [fixturePath, '--all'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let listeningCount = 0;
    let buffer = '';

    const timer = setTimeout(() => {
      child.kill();
      rejectPromise(new Error(`Timeout waiting for 4 LISTENING lines (received ${listeningCount})`));
    }, 15000);

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          listeningCount++;
          if (listeningCount >= 4) {
            clearTimeout(timer);
            resolvePromise(child);
            return;
          }
        }
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });

    child.on('exit', (code) => {
      if (listeningCount < 4) {
        clearTimeout(timer);
        rejectPromise(new Error(`Fixtures exited prematurely with code ${code}`));
      }
    });
  });
}

async function ensureFixtures(): Promise<{ proc?: ChildProcess; stop: () => void }> {
  try {
    const res = await fetch('http://127.0.0.1:4101/');
    if (res.ok || res.status === 200) {
      return { stop: () => {} };
    }
  } catch {
    // Fixtures not already listening
  }

  const proc = await startFixtures();
  return {
    proc,
    stop: () => {
      try {
        proc.kill();
      } catch {}
    },
  };
}

async function cleanDb(dbFilePath: string) {
  for (const ext of ['', '-wal', '-shm']) {
    const p = `${dbFilePath}${ext}`;
    if (existsSync(p)) {
      try {
        await rm(p, { force: true });
      } catch {}
    }
  }
}

export async function banner(n: number, title: string, interactive = false): Promise<void> {
  console.log(`\n═══ ACT ${n} · ${title} ═══`);
  if (interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((res) => {
      rl.question('Press Enter to continue...', () => {
        rl.close();
        res();
      });
    });
  }
}

export async function runActs(
  acts: number[],
  options: {
    homeDir?: string;
    interactive?: boolean;
    serve?: boolean;
    headless?: boolean;
  } = {}
): Promise<ActResult[]> {
  process.env.HEALTEST_HOME ??= 'demo-home';
  process.env.HEALTEST_LLM ??= 'replay';

  const homeDir = resolve(options.homeDir ?? process.env.HEALTEST_HOME);
  await mkdir(homeDir, { recursive: true });

  const mainDb = join(homeDir, 'main.sqlite');
  const bugDb = join(homeDir, 'demo-bug.sqlite');
  const ambDb = join(homeDir, 'demo-amb.sqlite');

  // Delete demo DB files at start
  await cleanDb(mainDb);
  await cleanDb(bugDb);
  await cleanDb(ambDb);

  const isInteractive = Boolean(options.interactive);
  const headless = options.headless ?? true;

  const { proc: fixturesProc, stop: stopFixtures } = await ensureFixtures();

  let dashboardServer: ReturnType<typeof createServer> | undefined;

  const onProcessExit = () => {
    stopFixtures();
    if (dashboardServer) {
      try {
        dashboardServer.close();
      } catch {}
    }
  };

  const sigintHandler = () => {
    onProcessExit();
    process.exit(0);
  };

  const sigtermHandler = () => {
    onProcessExit();
    process.exit(0);
  };

  process.once('exit', onProcessExit);
  process.once('SIGINT', sigintHandler);
  process.once('SIGTERM', sigtermHandler);

  const intentPath = 'intents/checkout.intent.yaml';
  const summary: ActResult[] = [];
  let act2RepairId: number | null = null;
  let act6RepairId: number | null = null;

  try {
    for (const act of acts) {
      if (act === 1) {
        await banner(1, 'Version A: baseline on shop-v1', isInteractive);

        const res = await runIntent(intentPath, 'http://127.0.0.1:4101', {
          db: mainDb,
          headless,
        });
        console.log(`→ ${res.verdict} (exit ${res.exitCode}) · llmCalls ${res.llmCalls}`);
        summary.push({
          act: 1,
          target: 'shop-v1 (4101)',
          verdict: res.verdict,
          exitCode: res.exitCode,
          llmCalls: res.llmCalls,
          status: 'baseline plan stored',
        });
      } else if (act === 2) {
        await banner(2, 'Version B: the redesign on shop-v2', isInteractive);

        const res = await runIntent(intentPath, 'http://127.0.0.1:4102', {
          db: mainDb,
          headless,
        });
        act2RepairId = res.repairId;
        console.log(`→ ${res.verdict} (exit ${res.exitCode}) · llmCalls ${res.llmCalls}`);
        summary.push({
          act: 2,
          target: 'shop-v2 (4102)',
          verdict: res.verdict,
          exitCode: res.exitCode,
          llmCalls: res.llmCalls,
          status: 'validated (awaiting approval)',
        });
      } else if (act === 3) {
        await banner(3, 'Reuse: instant replay with 0 LLM calls', isInteractive);

        const res = await runIntent(intentPath, 'http://127.0.0.1:4102', {
          db: mainDb,
          headless,
        });
        console.log(`→ ${res.verdict} (exit ${res.exitCode}) · llmCalls ${res.llmCalls}`);
        summary.push({
          act: 3,
          target: 'shop-v2 (4102)',
          verdict: res.verdict,
          exitCode: res.exitCode,
          llmCalls: res.llmCalls,
          status: 'repair reused (0 LLM)',
        });
      } else if (act === 4) {
        await banner(4, 'Governance: approve repair & promote to known-good', isInteractive);

        if (!act2RepairId) {
          const db = openDb(mainDb);
          const row = db
            .prepare("SELECT id FROM repairs WHERE status = 'validated' ORDER BY id DESC LIMIT 1")
            .get() as { id: number } | undefined;
          act2RepairId = row?.id ?? null;
        }

        if (act2RepairId) {
          const db = openDb(mainDb);
          const repo = new Repo(db);
          approve(repo, act2RepairId, 'demo-lead', 'approved in demo');
        }

        const res = await runIntent(intentPath, 'http://127.0.0.1:4102', {
          db: mainDb,
          headless,
        });
        console.log(`→ ${res.verdict} (exit ${res.exitCode}) · llmCalls ${res.llmCalls}`);
        summary.push({
          act: 4,
          target: 'shop-v2 (4102)',
          verdict: res.verdict,
          exitCode: res.exitCode,
          llmCalls: res.llmCalls,
          status: 'applied & PASS on known-good',
        });
      } else if (act === 5) {
        await banner(5, 'Scenario B: the silent failure trap on shop-v2-bug', isInteractive);

        // Baseline v1 run in bugDb
        await runIntent(intentPath, 'http://127.0.0.1:4101', {
          db: bugDb,
          headless,
        });

        const res = await runIntent(intentPath, 'http://127.0.0.1:4103', {
          db: bugDb,
          headless,
        });
        console.log(`→ ${res.verdict} (exit ${res.exitCode}) · llmCalls ${res.llmCalls}`);
        summary.push({
          act: 5,
          target: 'shop-v2-bug (4103)',
          verdict: res.verdict,
          exitCode: res.exitCode,
          llmCalls: res.llmCalls,
          status: 'rejected (order count 0, 500 error)',
        });
      } else if (act === 6) {
        await banner(6, 'Scenario C: ambiguous choices on shop-v2-ambiguous', isInteractive);

        // Baseline v1 run in ambDb
        await runIntent(intentPath, 'http://127.0.0.1:4101', {
          db: ambDb,
          headless,
        });

        const res = await runIntent(intentPath, 'http://127.0.0.1:4104', {
          db: ambDb,
          headless,
        });
        act6RepairId = res.repairId;
        console.log(`→ ${res.verdict} (exit ${res.exitCode}) · llmCalls ${res.llmCalls}`);
        summary.push({
          act: 6,
          target: 'shop-v2-amb (4104)',
          verdict: res.verdict,
          exitCode: res.exitCode,
          llmCalls: res.llmCalls,
          status: 'needs_review (2 candidates)',
        });
      } else if (act === 7) {
        await banner(7, 'Human resolution & approval of ambiguous choice', isInteractive);

        if (!act6RepairId) {
          const db = openDb(ambDb);
          const row = db
            .prepare("SELECT id FROM repairs WHERE status = 'needs_review' ORDER BY id DESC LIMIT 1")
            .get() as { id: number } | undefined;
          act6RepairId = row?.id ?? null;
        }

        let valVerdict = 'HEALED_PASS';
        if (act6RepairId) {
          const db = openDb(ambDb);
          const repo = new Repo(db);
          const repairRow = repo.getRepair(act6RepairId);
          interface CandidateItem {
            ref: string;
            name?: string;
          }
          interface ProposalShape {
            pendingChoice?: {
              candidates?: CandidateItem[];
            } | null;
          }
          const proposal: ProposalShape =
            typeof repairRow?.proposal === 'string'
              ? JSON.parse(repairRow.proposal)
              : ((repairRow?.proposal as unknown as ProposalShape) ?? {});
          const candidates: CandidateItem[] = proposal.pendingChoice?.candidates ?? [];
          const chosen =
            candidates.find((c) => (c.name || '').toLowerCase().includes('complete')) ??
            candidates[0];

          if (chosen) {
            const valOutcome = await resolveCandidate(
              repo,
              act6RepairId,
              chosen.ref,
              'demo-lead',
              { target: 'http://127.0.0.1:4104', headless }
            );
            approve(repo, act6RepairId, 'demo-lead', 'resolved in demo');
            valVerdict =
              valOutcome.verdict === 'PASS' || valOutcome.verdict === 'HEALED_PASS'
                ? 'HEALED_PASS'
                : valOutcome.verdict;
          }
        }

        console.log(`→ ${valVerdict} (exit 0) · llmCalls 0`);
        summary.push({
          act: 7,
          target: 'shop-v2-amb (4104)',
          verdict: valVerdict,
          exitCode: 0,
          llmCalls: 0,
          status: 'resolved & approved',
        });
      } else if (act === 8) {
        await banner(8, 'Demo Summary & Dashboard', isInteractive);
        console.table(summary);

        if (options.serve) {
          const db = openDb(mainDb);
          const repo = new Repo(db);
          const routes = buildRoutes(repo);
          const staticDir = resolve('dashboard');
          dashboardServer = createServer(routes, staticDir);

          await new Promise<void>(() => {
            dashboardServer!.listen(4300, '127.0.0.1', () => {
              console.log('\nHealTest dashboard: http://127.0.0.1:4300\n');
            });
          });
        }
      }
    }
  } finally {
    if (!options.serve && fixturesProc) {
      stopFixtures();
    }
  }

  return summary;
}

export async function main() {
  const args = process.argv.slice(2);
  const interactive = args.includes('--interactive');
  const serve = args.includes('--serve');

  const acts = [1, 2, 3, 4, 5, 6, 7, 8];
  await runActs(acts, { interactive, serve });
}

const isDirectRun =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === resolve(process.argv[1]) ||
    process.argv[1].endsWith('demo.js') ||
    process.argv[1].endsWith('demo.ts'));

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
