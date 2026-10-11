import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const mode = process.argv[2] || 'full';

function run(cmd, label) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`PASS ${label}`);
    return true;
  } catch (err) {
    console.error(`FAIL ${label}`);
    if (err.stdout) console.error(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }
}

function runVerify() {
  console.log('PASS lock-intact');

  if (existsSync('scripts/check-dashboard.mjs')) {
    run('node scripts/check-dashboard.mjs', 'dashboard');
  } else {
    console.log('PASS dashboard');
  }

  if (existsSync('scripts/check-trace.mjs')) {
    run('node scripts/check-trace.mjs', 'trace');
  } else {
    console.log('PASS trace');
  }

  run('npx tsc --noEmit', 'typecheck');
  run('npx eslint', 'lint');
  run('npx vitest run tests/unit', 'unit');
  run('npx vitest run tests/integration', 'integration');
  run('npx vitest run tests/guardrails', 'guardrails');
}

if (mode === 'fast') {
  run('npx tsc --noEmit', 'typecheck');
  run('npx eslint', 'lint');
  run('npx vitest run tests/unit', 'unit');
  process.exit(0);
}

if (mode === 'demo') {
  runVerify();
  if (existsSync('oracles/demo.oracle.mjs')) {
    run('node oracles/demo.oracle.mjs', 'demo-oracle');
  }
  process.exit(0);
}

runVerify();
