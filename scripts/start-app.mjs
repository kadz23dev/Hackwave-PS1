import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PORTS = [4300, 4101, 4102, 4103, 4104];
const children = [];

function freePort(port) {
  try {
    const stdout = execSync('netstat -ano', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = stdout.split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[1].includes(`:${port}`) && parts[3] === 'LISTENING') {
        const pid = parts[4];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            console.log(`[clean] Freed port ${port} (killed stale PID ${pid})`);
          } catch {}
        }
      }
    }
  } catch {}
}

function cleanup() {
  for (const child of children) {
    try {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    } catch {}
  }
  for (const port of PORTS) {
    freePort(port);
  }
}

process.on('SIGINT', () => {
  console.log('\n[Kaizen AI] Shutting down services cleanly...');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', () => {
  cleanup();
});

async function main() {
  console.log('═'.repeat(64));
  console.log('  KAIZEN AI (HealTest) — Unified Application Launcher');
  console.log('═'.repeat(64));

  // 1. Clear any zombie processes
  console.log('[1/4] Checking ports and clearing stale processes...');
  for (const port of PORTS) {
    freePort(port);
  }

  // 2. Build if needed
  console.log('[2/4] Building TypeScript code & copying SQL schemas...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }

  // 3. Ensure database exists
  const dbPath = resolve('demo-home/main.sqlite');
  if (!existsSync(dbPath)) {
    console.log('[*] Initializing SQLite demo database...');
    try {
      execSync('node dist/demo.js', { stdio: 'inherit' });
    } catch (e) {
      console.warn('Initial demo run warning:', e.message);
    }
  }

  // 4. Start fixture stores (4101-4104)
  console.log('[3/4] Launching target store fixtures (ports 4101-4104)...');
  const fixtureProc = spawn('node', ['fixtures/server.mjs', '--all'], {
    stdio: 'inherit',
    detached: false,
  });
  children.push(fixtureProc);

  // Wait 1.5 seconds for fixtures to bind
  await new Promise((r) => setTimeout(r, 1500));

  // 5. Start main backend API server & frontend dashboard
  console.log('[4/4] Starting Kaizen AI Backend API & Frontend Dashboard...');
  const serverProc = spawn('node', ['dist/cli.js', 'serve', '--db', 'demo-home/main.sqlite', '--port', '4300'], {
    stdio: 'inherit',
    detached: false,
  });
  children.push(serverProc);

  console.log('\n' + '═'.repeat(64));
  console.log('  APPLICATION IS LIVE AND READY:');
  console.log('  ➜ Web App & Dashboard: http://127.0.0.1:4300');
  console.log('  ➜ Studio Workspace:    http://127.0.0.1:4300/#/dashboard');
  console.log('  ➜ Simulation Engine:   http://127.0.0.1:4300/#/simulation');
  console.log('  Target Store Fixtures:');
  console.log('  ➜ Baseline (v1):       http://127.0.0.1:4101/cart.html');
  console.log('  ➜ Redesign (v2):       http://127.0.0.1:4102/cart.html');
  console.log('  ➜ Silent Bug (v2-bug): http://127.0.0.1:4103/checkout.html');
  console.log('  ➜ Ambiguous (v2-amb):  http://127.0.0.1:4104/payment.html');
  console.log('═'.repeat(64));
  console.log('Press Ctrl+C at any time to stop all services.\n');
}

main().catch((err) => {
  console.error('[Error]', err);
  cleanup();
  process.exit(1);
});
