import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export async function startFixture(variant: string, port = '0'): Promise<{ url: string; stop(): Promise<void> }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const fixturePath = resolve('fixtures/server.mjs');
    const child = spawn(process.execPath, [fixturePath, '--variant', variant, '--port', port]);

    let url = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        child.kill();
        rejectPromise(new Error(`Timeout waiting for fixture server to start variant: ${variant}`));
      }
    }, 10000);

    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^LISTENING (\S+) (\d+)$/);
        if (match) {
          const port = match[2];
          url = `http://127.0.0.1:${port}`;
          resolved = true;
          clearTimeout(timeout);
          resolvePromise({
            url,
            stop: () => {
              return new Promise((resolveStop) => {
                let resolvedStop = false;
                const done = () => {
                  if (!resolvedStop) {
                    resolvedStop = true;
                    resolveStop();
                  }
                };
                child.on('exit', done);
                if (process.platform === 'win32' && child.pid) {
                  try {
                    spawn('taskkill', ['/pid', String(child.pid), '/f', '/t']);
                  } catch {
                    child.kill();
                  }
                } else {
                  child.kill();
                }
                setTimeout(done, 300);
              });
            },
          });
          return;
        }
      }
    });

    child.stderr.on('data', (errChunk: Buffer) => {
      console.error(errChunk.toString());
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      rejectPromise(err);
    });
  });
}
