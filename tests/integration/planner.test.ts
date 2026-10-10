import { describe, it, expect, afterAll } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { tempDb } from '../helpers/db.js';
import { openSession, type Session } from '../../src/browser/session.js';
import { loadIntent } from '../../src/intent/load.js';
import { planAndExecute } from '../../src/planner/plan.js';
import { NullClient } from '../../src/llm/client.js';
import type { Intent } from '../../src/types.js';

describe('Planner integration — T10', { timeout: 60000 }, () => {
  let fixtureV2: { url: string; stop(): Promise<void> } | undefined;
  let session: Session | undefined;

  afterAll(async () => {
    if (session) await session.close();
    if (fixtureV2) await fixtureV2.stop();
  });

  it('[R-PS-04] planner builds a full step list on v2 from intent alone (no stored plan) and reaches /confirmation', async () => {
    fixtureV2 = await startFixture('shop-v2');

    const loaded = loadIntent('intents/checkout.intent.yaml');
    const intent: Intent = {
      ...loaded.intent,
      allowedOrigins: [fixtureV2.url],
    };

    session = await openSession({ headless: true, intent });
    await session.page.goto(fixtureV2.url + intent.startPath);

    const { repo } = tempDb();
    const site = repo.upsertSite(intent.site, fixtureV2.url, intent.allowedOrigins);

    const result = await planAndExecute(session, intent, repo, {
      repair: false,
      completed: [],
      llm: new NullClient(),
      pageIdFor: (path: string) => repo.upsertPage(site.id, path).id,
    });
    expect(result.status).toBe('done');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(session.page.url()).toContain('/confirmation');
  });

  it('[R-F2-03] planner on v2 handles the split checkout and the terms checkbox', async () => {
    // Session is already on confirmation from previous test, or start fresh if needed
    if (!fixtureV2) {
      fixtureV2 = await startFixture('shop-v2');
    }

    // Reset fixture
    await fetch(`${fixtureV2.url}/__reset`, { method: 'POST' }).catch(() => {});

    if (session) {
      await session.close();
    }

    const loaded = loadIntent('intents/checkout.intent.yaml');
    const intent: Intent = {
      ...loaded.intent,
      allowedOrigins: [fixtureV2.url],
    };

    session = await openSession({ headless: true, intent });
    await session.page.goto(fixtureV2.url + intent.startPath);

    const { repo } = tempDb();
    const site = repo.upsertSite(intent.site, fixtureV2.url, intent.allowedOrigins);

    const result = await planAndExecute(session, intent, repo, {
      repair: false,
      completed: [],
      llm: new NullClient(),
      pageIdFor: (path: string) => repo.upsertPage(site.id, path).id,
    });

    expect(result.status).toBe('done');

    // Verify split checkout: visited both /checkout/details and /checkout/payment
    const paths = result.steps.map(s => s.pagePath);
    expect(paths.some(p => p.includes('/checkout/details'))).toBe(true);
    expect(paths.some(p => p.includes('/checkout/payment'))).toBe(true);

    // Verify terms checkbox step was executed
    const checkStepIndex = result.steps.findIndex(s => s.action === 'check');
    expect(checkStepIndex).toBeGreaterThan(-1);

    // Verify terms checkbox was checked before the final place order click
    const placeOrderIndex = result.steps.findIndex(
      s => s.action === 'click' && /\b(place order|pay)\b/i.test(s.target.name)
    );
    expect(placeOrderIndex).toBeGreaterThan(checkStepIndex);
  });
});
