import { describe, it, expect, afterEach } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';
import { openSession, type Session } from '../../src/browser/session.js';
import type { Page } from 'playwright';
import { loadIntent } from '../../src/intent/load.js';
import { runOracles, allRequiredPass } from '../../src/oracle/runner.js';
import type { Intent } from '../../src/types.js';

describe('Deterministic Oracle Runner Integration — T08', { timeout: 60000 }, () => {
  let fixture: { url: string; stop(): Promise<void> } | undefined;
  let session: Session | undefined;

  afterEach(async () => {
    if (session) {
      await session.close();
      session = undefined;
    }
    if (fixture) {
      await fixture.stop();
      fixture = undefined;
    }
  });

  it('[R-PS-05] backend oracle passes after a real v1 purchase', async () => {
    fixture = await startFixture('shop-v1');
    await fetch(`${fixture.url}/__reset`, { method: 'POST' });

    const { intent } = loadIntent('intents/checkout.intent.yaml');
    session = await openSession({ headless: true, intent });

    // Step 1: Home page -> click "Add to cart"
    await session.page.goto(fixture.url + '/');
    await session.page.click('button#add-GZ-MINI');
    await session.page.waitForLoadState('networkidle').catch(() => {});

    // Step 2: Go to /cart -> click "Checkout"
    await session.page.goto(fixture.url + '/cart');
    await session.page.click('button#checkout-button');
    await session.page.waitForURL(/\/checkout/);

    // Step 3: Fill checkout form & submit
    await session.page.fill('#email', intent.data.email);
    await session.page.fill('#name', intent.data.name);
    await session.page.fill('#address', intent.data.address);
    await session.page.fill('#card-number', intent.data.cardNumber);
    await session.page.fill('#expiry', intent.data.expiry);
    await session.page.fill('#cvc', intent.data.cvc);
    await session.page.click('#pay-button');
    await session.page.waitForURL(/\/confirmation/);

    const results = await runOracles(intent, fixture.url, session.network, session.page);

    const backendOracle = results.find(r => r.oracleId === 'order-created');
    expect(backendOracle?.ok).toBe(true);

    const noErrorsOracle = results.find(r => r.oracleId === 'no-server-errors');
    expect(noErrorsOracle?.ok).toBe(true);

    const orderApiOkOracle = results.find(r => r.oracleId === 'order-api-ok');
    expect(orderApiOkOracle?.ok).toBe(true);

    const domOracle = results.find(r => r.oracleId === 'confirmation-shown');
    expect(domOracle?.ok).toBe(true);

    expect(allRequiredPass(results)).toBe(true);
  });

  it("[R-F4-05] on v2-bug the DOM says 'Order confirmed' but allRequiredPass is false", async () => {
    fixture = await startFixture('shop-v2-bug');
    await fetch(`${fixture.url}/__reset`, { method: 'POST' });

    const { intent } = loadIntent('intents/checkout.intent.yaml');
    session = await openSession({ headless: true, intent });

    // Drive purchase on v2-bug directly
    await session.page.goto(fixture.url + '/');
    await session.page.click('button:has-text("Add to bag")');
    await session.page.waitForLoadState('networkidle').catch(() => {});

    await session.page.goto(fixture.url + '/checkout/details');
    await session.page.fill('#user-email', intent.data.email);
    await session.page.fill('#fullname', intent.data.name);
    await session.page.fill('#ship-addr', intent.data.address);
    await session.page.click('button:has-text("Continue")');
    await session.page.waitForURL(/\/checkout\/payment/);

    await session.page.fill('#cc', intent.data.cardNumber);
    await session.page.fill('#exp', intent.data.expiry);
    await session.page.fill('#sec', intent.data.cvc);
    await session.page.check('#terms');
    await session.page.click('button#place');
    await session.page.waitForURL(/\/confirmation/);

    const results = await runOracles(intent, fixture.url, session.network, session.page);

    const domOracle = results.find(r => r.oracleId === 'confirmation-shown');
    expect(domOracle?.ok).toBe(true);

    const noErrorsOracle = results.find(r => r.oracleId === 'no-server-errors');
    expect(noErrorsOracle?.ok).toBe(false);

    const orderCreatedOracle = results.find(r => r.oracleId === 'order-created');
    expect(orderCreatedOracle?.ok).toBe(false);

    expect(allRequiredPass(results)).toBe(false);
  });

  it('[R-F4-04] oracle that throws (server stopped) is ok:false, never pass', async () => {
    fixture = await startFixture('shop-v1');
    const { intent } = loadIntent('intents/checkout.intent.yaml');
    session = await openSession({ headless: true, intent });
    const targetUrl = fixture.url;

    // Stop fixture before running oracles to cause connection refusal / error
    await fixture.stop();
    fixture = undefined;

    const results = await runOracles(intent, targetUrl, session.network, session.page);
    const backendOracle = results.find(r => r.oracleId === 'order-created');
    expect(backendOracle?.ok).toBe(false);
    expect(backendOracle?.detail).toHaveProperty('error');
    expect(allRequiredPass(results)).toBe(false);
  });

  it('requireStatusIn fails when no matching request exists', async () => {
    const intent: Intent = {
      name: 'network-status-test',
      site: 'test',
      goal: 'Test network status requirements',
      startPath: '/',
      actionBudget: 10,
      allowedOrigins: ['http://127.0.0.1:4101'],
      data: {},
      planner: { doneWhen: { pathPattern: '/done' } },
      expected: [
        {
          id: 'order-api-required',
          type: 'network_status',
          urlPattern: '^/api/orders$',
          method: 'POST',
          requireStatusIn: [200, 201],
        },
      ],
    };

    // No matching network requests
    const results = await runOracles(intent, 'http://127.0.0.1:4101', [], {} as unknown as Page);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(allRequiredPass(results)).toBe(false);
  });
});
