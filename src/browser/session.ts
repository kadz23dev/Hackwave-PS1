import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { VIEWPORT, NAV_TIMEOUT_MS, ACTION_TIMEOUT_MS } from '../config.js';
import type { Intent, NetworkEvent } from '../types.js';
import { assertOriginAllowed } from '../executor/guards.js';

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  network: NetworkEvent[];
  violations: string[];
  close(): Promise<void>;
}

export async function openSession(opts?: { headless?: boolean; intent?: Intent }): Promise<Session> {
  const headless = opts?.headless ?? true;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: VIEWPORT });

  context.setDefaultTimeout(ACTION_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  const page = await context.newPage();
  const network: NetworkEvent[] = [];
  const violations: string[] = [];

  if (opts?.intent) {
    const intent = opts.intent;
    page.on('framenavigated', f => {
      if (f === page.mainFrame()) {
        try {
          assertOriginAllowed(f.url(), intent);
        } catch (e) {
          violations.push(String(e));
        }
      }
    });
  }

  page.on('response', r => {
    try {
      network.push({
        method: r.request().method(),
        url: r.url(),
        path: new URL(r.url()).pathname,
        status: r.status(),
        ts: Date.now(),
      });
    } catch {
      // Ignore URL parsing errors for non-standard schemes
    }
  });

  const close = async () => {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  };

  return {
    browser,
    context,
    page,
    network,
    violations,
    close,
  };
}
