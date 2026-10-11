import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('CLI integration and exit codes — T15', { timeout: 120000 }, () => {
  let fixturesProc: ChildProcess | undefined;
  let tempDir: string;

  beforeAll(async () => {
    // 1. Build project before running CLI commands
    execSync('npm run build', { stdio: 'inherit' });

    tempDir = mkdtempSync(join(tmpdir(), 'healtest-cli-'));

    // 2. Start all fixture servers
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const fixtureScript = resolve('fixtures/server.mjs');
      fixturesProc = spawn(process.execPath, [fixtureScript, '--all']);

      let listeningCount = 0;
      const timeout = setTimeout(() => {
        fixturesProc?.kill();
        rejectPromise(new Error('Timeout waiting for fixture servers'));
      }, 15000);

      fixturesProc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.includes('LISTENING')) {
            listeningCount++;
            if (listeningCount >= 4) {
              clearTimeout(timeout);
              resolvePromise();
            }
          }
        }
      });

      fixturesProc.on('error', (err) => {
        clearTimeout(timeout);
        rejectPromise(err);
      });
    });
  });

  afterAll(() => {
    if (fixturesProc && fixturesProc.pid) {
      if (process.platform === 'win32') {
        try {
          spawnSync('taskkill', ['/pid', String(fixturesProc.pid), '/f', '/t']);
        } catch {
          fixturesProc.kill();
        }
      } else {
        fixturesProc.kill();
      }
    }
  });

  function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const res = spawnSync(process.execPath, ['dist/cli.js', ...args], {
      encoding: 'utf8',
      env: { ...process.env, HEALTEST_LLM: 'replay' },
    });
    return {
      status: res.status,
      stdout: res.stdout || '',
      stderr: res.stderr || '',
    };
  }

  it('cli exit codes: 0 PASS, 10 APP_BUG, 11 NEEDS_REVIEW, 12 FAIL_UNREPAIRABLE, 1 bad intent path', () => {
    // 1. Exit code 0 (PASS): Baseline run on v1
    const db0 = join(tempDir, 'exit0.sqlite');
    const res0 = runCli(['run', 'intents/checkout.intent.yaml', '--target', 'http://127.0.0.1:4101', '--db', db0]);
    expect(res0.status).toBe(0);

    // 2. Exit code 10 (APP_BUG): Baseline v1 then v2-bug
    const db10 = join(tempDir, 'exit10.sqlite');
    const resBaselineBug = runCli(['run', 'intents/checkout.intent.yaml', '--target', 'http://127.0.0.1:4101', '--db', db10]);
    expect(resBaselineBug.status).toBe(0);
    const res10 = runCli(['run', 'intents/checkout.intent.yaml', '--target', 'http://127.0.0.1:4103', '--db', db10]);
    expect(res10.status).toBe(10);

    // 3. Exit code 11 (NEEDS_REVIEW): Baseline v1 then v2-ambiguous
    const db11 = join(tempDir, 'exit11.sqlite');
    const resBaselineAmb = runCli(['run', 'intents/checkout.intent.yaml', '--target', 'http://127.0.0.1:4101', '--db', db11]);
    expect(resBaselineAmb.status).toBe(0);
    const res11 = runCli(['run', 'intents/checkout.intent.yaml', '--target', 'http://127.0.0.1:4104', '--db', db11]);
    expect(res11.status).toBe(11);

    // 4. Exit code 12 (FAIL_UNREPAIRABLE): actionBudget: 2 exhausted
    const db12 = join(tempDir, 'exit12.sqlite');
    const intentRaw = readFileSync('intents/checkout.intent.yaml', 'utf8');
    const budgetIntent = intentRaw.replace(/actionBudget:\s*\d+/, 'actionBudget: 2');
    const budgetIntentPath = join(tempDir, 'budget-2.intent.yaml');
    writeFileSync(budgetIntentPath, budgetIntent, 'utf8');

    const res12 = runCli(['run', budgetIntentPath, '--target', 'http://127.0.0.1:4101', '--db', db12]);
    expect(res12.status).toBe(12);

    // 5. Exit code 1: Bad intent file path
    const db1 = join(tempDir, 'exit1.sqlite');
    const res1 = runCli(['run', 'nonexistent/missing.intent.yaml', '--target', 'http://127.0.0.1:4101', '--db', db1]);
    expect(res1.status).toBe(1);
    expect(res1.stderr).toMatch(/error:/i);
  });

  it('node dist/cli.js --help lists all 11 commands', () => {
    const res = runCli(['--help']);
    expect(res.status).toBe(0);
    const commands = [
      'diff',
      'run',
      'validate',
      'approve',
      'reject',
      'resolve',
      'rollback',
      'report',
      'scan',
      'repair',
      'serve',
    ];

    for (const cmd of commands) {
      expect(res.stdout).toContain(cmd);
    }
  });

  it('healtest scan captures snapshots and prints ids', () => {
    const scanDb = join(tempDir, 'scan.sqlite');
    const res = runCli(['scan', 'shop-test', '--target', 'http://127.0.0.1:4101', '--paths', '/', '--db', scanDb]);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/\[scan\]\s+\/\s+→\s+snapshot\s+#\d+/);
  });

  it('healtest repair creates repair for change', () => {
    const db11 = join(tempDir, 'exit11.sqlite');
    const res = runCli(['repair', '1', '--db', db11]);
    expect([0, 11]).toContain(res.status);
    expect(res.stdout).toMatch(/\[repair\]/);

    const resMissing = runCli(['repair', '9999', '--db', db11]);
    expect(resMissing.status).toBe(1);
    expect(resMissing.stderr).toMatch(/error:/i);
  });
});
