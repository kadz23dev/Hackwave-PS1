import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const results = [];
function check(tag, ok, reason = '') {
  results.push({ tag, ok, reason });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${tag} ${ok ? '' : reason}`);
}

const tempDir = path.join(process.cwd(), '.tmp-oracle');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const mainDb = path.join(tempDir, 'main.sqlite');
const bugDb = path.join(tempDir, 'bug.sqlite');
const ambDb = path.join(tempDir, 'amb.sqlite');

for (const dbPath of [mainDb, bugDb, ambDb]) {
  for (const ext of ['', '-wal', '-shm']) {
    const filePath = `${dbPath}${ext}`;
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

function cli(args, db) {
  const res = spawnSync('node', ['dist/cli.js', ...args, '--db', db], {
    env: { ...process.env, HEALTEST_LLM: 'replay' },
    encoding: 'utf8',
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function report(runId, db) {
  const res = cli(['report', String(runId), '--json'], db);
  return JSON.parse(res.stdout);
}

function sql(dbPath, query, ...params) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const stmt = db.prepare(query);
    return stmt.all(...params);
  } finally {
    db.close();
  }
}

function getMaxRunId(db) {
  const rows = sql(db, "SELECT max(id) AS id FROM runs WHERE kind='run'");
  return rows[0]?.id;
}

function startFixtures() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['fixtures/server.mjs', '--all'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let listeningCount = 0;
    let buffer = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timeout waiting for 4 LISTENING lines (received ${listeningCount})`));
    }, 15000);

    proc.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          listeningCount++;
          if (listeningCount >= 4) {
            clearTimeout(timer);
            resolve(proc);
            return;
          }
        }
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('exit', code => {
      if (listeningCount < 4) {
        clearTimeout(timer);
        reject(new Error(`Fixtures exited prematurely with code ${code}`));
      }
    });
  });
}

async function waitForServer(url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) {
        return;
      }
    } catch {
      // server not ready yet
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function run() {
  let fixturesProc = null;
  try {
    fixturesProc = await startFixtures();

    const intentFile = 'intents/checkout.intent.yaml';
    const intentBytes = fs.readFileSync(intentFile);
    const expectedSha256 = crypto.createHash('sha256').update(intentBytes).digest('hex');

    // Assertion 1: [R-PS-07] [R-PS-01] [R-F1-01]
    {
      const res = cli(['run', intentFile, '--target', 'http://127.0.0.1:4101'], mainDb);
      const runId = getMaxRunId(mainDb);
      let rep = null;
      try {
        if (runId != null) rep = report(runId, mainDb);
      } catch (e) {
        // failed to parse report
      }
      const snapshots = sql(mainDb, 'SELECT count(*) AS cnt FROM snapshots');
      const runRow = runId != null ? sql(mainDb, 'SELECT intent_sha256 FROM runs WHERE id = ?', runId)[0] : null;

      const ok = res.status === 0 &&
        rep?.verdict === 'PASS' &&
        Number(snapshots[0]?.cnt || 0) > 0 &&
        runRow?.intent_sha256 === expectedSha256;

      const reason = !ok
        ? `status=${res.status}, verdict=${rep?.verdict}, snapshots=${snapshots[0]?.cnt}, shaMatch=${runRow?.intent_sha256 === expectedSha256}`
        : '';
      check('[R-PS-07] [R-PS-01] [R-F1-01] v1 run exit 0, verdict PASS, snapshots stored, intent sha256 matches', ok, reason);
    }

    // Assertion 2: [R-PS-08] [R-PS-09] [R-SC-A] [R-PS-03] [R-PS-04] [R-PS-05]
    {
      const res = cli(['run', intentFile, '--target', 'http://127.0.0.1:4102'], mainDb);
      const runId = getMaxRunId(mainDb);
      let rep = null;
      try {
        if (runId != null) rep = report(runId, mainDb);
      } catch (e) {
        // failed to parse report
      }

      const changes = sql(
        mainDb,
        "SELECT explanation FROM changes WHERE explanation LIKE '%no longer matches%' OR explanation LIKE '%flow changed%'"
      );
      const repairs = sql(mainDb, 'SELECT id, status FROM repairs ORDER BY id DESC LIMIT 1');
      const latestRepair = repairs[0];
      const valRuns = latestRepair
        ? sql(mainDb, 'SELECT verdict FROM validation_runs WHERE repair_id = ? ORDER BY id DESC LIMIT 1', latestRepair.id)
        : [];

      let orderCount = 0;
      try {
        const stateRes = await fetch('http://127.0.0.1:4102/__state');
        const state = await stateRes.json();
        orderCount = Array.isArray(state?.orders) ? state.orders.length : 0;
      } catch {
        orderCount = -1;
      }

      const repairStatusOk = latestRepair?.status === 'validated' || latestRepair?.status === 'applied';
      const valRunOk = valRuns[0]?.verdict === 'PASS';

      const ok = res.status === 0 &&
        rep?.verdict === 'HEALED_PASS' &&
        changes.length >= 1 &&
        repairStatusOk &&
        valRunOk &&
        orderCount === 1;

      const reason = !ok
        ? `status=${res.status}, verdict=${rep?.verdict}, changes=${changes.length}, repairStatus=${latestRepair?.status}, valRunVerdict=${valRuns[0]?.verdict}, orderCount=${orderCount}`
        : '';
      check('[R-PS-08] [R-PS-09] [R-SC-A] [R-PS-03] [R-PS-04] [R-PS-05] v2 run yields HEALED_PASS, explanation, validated repair, passing validation run, and backend state', ok, reason);
    }

    // Assertion 3: [R-PIPE-01]
    {
      const res = cli(['run', intentFile, '--target', 'http://127.0.0.1:4102'], mainDb);
      const runId = getMaxRunId(mainDb);
      const runRow = runId != null
        ? sql(mainDb, 'SELECT llm_calls, reused_repair_id FROM runs WHERE id = ?', runId)[0]
        : null;

      const ok = res.status === 0 &&
        runRow?.llm_calls === 0 &&
        runRow?.reused_repair_id != null;

      const reason = !ok
        ? `status=${res.status}, llm_calls=${runRow?.llm_calls}, reused_repair_id=${runRow?.reused_repair_id}`
        : '';
      check('[R-PIPE-01] second v2 run exit 0, zero LLM calls, and reuses repair', ok, reason);
    }

    // Assertion 4: [R-F3-07]
    {
      const repairs = sql(mainDb, 'SELECT id, change_id, status FROM repairs');
      const allHaveChangeId = repairs.length > 0 && repairs.every(r => r.change_id != null);
      const validatedRepairs = repairs.filter(r => r.status === 'validated' || r.status === 'applied');
      const allHaveValidationRuns = validatedRepairs.length > 0 && validatedRepairs.every(r => {
        const rows = sql(mainDb, 'SELECT count(*) AS cnt FROM validation_runs WHERE repair_id = ?', r.id);
        return Number(rows[0]?.cnt || 0) > 0;
      });

      const ok = allHaveChangeId && allHaveValidationRuns;
      const reason = !ok
        ? `allHaveChangeId=${allHaveChangeId}, allHaveValidationRuns=${allHaveValidationRuns}, repairs=${repairs.length}`
        : '';
      check('[R-F3-07] every repairs row has a change_id, and every validated repair has a validation_runs row', ok, reason);
    }

    // Assertion 5: [R-SC-B] [R-PS-06]
    {
      cli(['run', intentFile, '--target', 'http://127.0.0.1:4101'], bugDb);
      const resBug = cli(['run', intentFile, '--target', 'http://127.0.0.1:4103'], bugDb);
      const runIdBug = getMaxRunId(bugDb);

      let repBug = null;
      try {
        if (runIdBug != null) repBug = report(runIdBug, bugDb);
      } catch (e) {
        // failed to parse report
      }

      const bugRepairs = sql(bugDb, 'SELECT id, status FROM repairs ORDER BY id DESC LIMIT 1');
      const oracleRows = sql(
        bugDb,
        "SELECT ok FROM oracle_results WHERE oracle_id = 'order-created' OR name = 'order-created' ORDER BY id DESC LIMIT 1"
      );

      const oracleOk = oracleRows.length > 0 && Number(oracleRows[0]?.ok) === 0;
      const ok = resBug.status === 10 &&
        repBug?.verdict === 'APP_BUG' &&
        bugRepairs[0]?.status === 'rejected' &&
        oracleOk;

      const reason = !ok
        ? `status=${resBug.status}, verdict=${repBug?.verdict}, repairStatus=${bugRepairs[0]?.status}, oracleOk=${oracleRows[0]?.ok}`
        : '';
      check('[R-SC-B] [R-PS-06] v2-bug yields APP_BUG and rejected repair', ok, reason);
    }

    // Assertion 6: [R-SC-C] [R-F4-06]
    {
      cli(['run', intentFile, '--target', 'http://127.0.0.1:4101'], ambDb);
      const resAmb = cli(['run', intentFile, '--target', 'http://127.0.0.1:4104'], ambDb);
      const ambRepairs = sql(ambDb, 'SELECT id, status, proposal_json FROM repairs ORDER BY id DESC LIMIT 1');

      let candidatesCount = 0;
      try {
        const proposal = JSON.parse(ambRepairs[0]?.proposal_json || '{}');
        candidatesCount = Array.isArray(proposal?.pendingChoice?.candidates)
          ? proposal.pendingChoice.candidates.length
          : 0;
      } catch {
        candidatesCount = 0;
      }

      const ok = resAmb.status === 11 &&
        ambRepairs[0]?.status === 'needs_review' &&
        candidatesCount >= 2;

      const reason = !ok
        ? `status=${resAmb.status}, repairStatus=${ambRepairs[0]?.status}, candidatesCount=${candidatesCount}`
        : '';
      check('[R-SC-C] [R-F4-06] fresh DB: v1, then v2-ambiguous yields exit 11, needs_review, and multiple candidates', ok, reason);
    }

    // Assertion 7: [R-F4-07]
    {
      let deleteThrew = false;
      try {
        const dbRW = new Database(mainDb);
        try {
          dbRW.prepare('DELETE FROM audit_log').run();
        } finally {
          dbRW.close();
        }
      } catch {
        deleteThrew = true;
      }

      check('[R-F4-07] DELETE FROM audit_log throws due to append-only trigger', deleteThrew, deleteThrew ? '' : 'DELETE did not throw');
    }

    // Assertion 8: [R-F5-01]...[R-F5-07]
    {
      const repairRow = sql(mainDb, 'SELECT id FROM repairs LIMIT 1')[0];
      const repairId = repairRow?.id ?? 1;

      const serveProc = spawn('node', ['dist/cli.js', 'serve', '--port', '4399', '--db', mainDb], {
        stdio: 'pipe',
      });

      let serveOk = false;
      let serveReason = '';

      try {
        await waitForServer('http://127.0.0.1:4399/', 5000);

        const indexRes = await fetch('http://127.0.0.1:4399/');
        const indexHtml = await indexRes.text();

        const requiredIds = ['view-overview', 'view-changes', 'view-change', 'view-repair', 'view-audit'];
        const hasDomIds = requiredIds.every(id => indexHtml.includes(id));

        const sitesRes = await fetch('http://127.0.0.1:4399/api/sites');
        const sitesJson = await sitesRes.json();
        const sitesOk = sitesRes.status === 200 && (Array.isArray(sitesJson) ? sitesJson.length > 0 : Object.keys(sitesJson).length > 0);

        const changesRes = await fetch('http://127.0.0.1:4399/api/changes');
        const changesJson = await changesRes.json();
        const changesOk = changesRes.status === 200 && (Array.isArray(changesJson) ? changesJson.length > 0 : Object.keys(changesJson).length > 0);

        const repairRes = await fetch(`http://127.0.0.1:4399/api/repairs/${repairId}`);
        const repairJson = await repairRes.json();
        const repairOk = repairRes.status === 200 && (Array.isArray(repairJson) ? repairJson.length > 0 : Object.keys(repairJson).length > 0);

        const auditRes = await fetch('http://127.0.0.1:4399/api/audit');
        const auditJson = await auditRes.json();
        const auditOk = auditRes.status === 200 && (Array.isArray(auditJson) ? auditJson.length > 0 : Object.keys(auditJson).length > 0);

        serveOk = indexRes.status === 200 && hasDomIds && sitesOk && changesOk && repairOk && auditOk;
        if (!serveOk) {
          serveReason = `index=${indexRes.status}, hasDomIds=${hasDomIds}, sitesOk=${sitesOk}, changesOk=${changesOk}, repairOk=${repairOk}, auditOk=${auditOk}`;
        }
      } catch (err) {
        serveReason = err instanceof Error ? err.message : String(err);
      } finally {
        serveProc.kill();
      }

      check('[R-F5-01]...[R-F5-07] healtest serve responds 200 on all endpoints and index.html satisfies DOM contract', serveOk, serveReason);
    }
  } catch (err) {
    console.error('Fatal oracle execution error:', err);
  } finally {
    if (fixturesProc) {
      fixturesProc.kill();
    }
    const allPass = results.length === 8 && results.every(r => r.ok);
    process.exit(allPass ? 0 : 1);
  }
}

run();
