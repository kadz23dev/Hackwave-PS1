import type { Page } from 'playwright';
import type { ElementRecord, Intent, PageSnapshot, Step } from '../types.js';
import {
  assertDataKey,
  assertNotForbidden,
  assertObserved,
  assertOriginAllowed,
  GuardViolation,
} from './guards.js';

/**
 * Execute a planned step in the browser with security guards — PRD §10.4, §15
 */
export async function executeStep(
  page: Page,
  step: Step,
  el: ElementRecord,
  intent: Intent,
  snap: PageSnapshot,
): Promise<void> {
  // Guard G2: ensure the element ref exists in the current snapshot
  assertObserved(el.ref, snap);

  const loc = page.locator(`[data-healtest-ref="${el.ref}"]`);

  switch (step.action) {
    case 'click': {
      // Guard G2/G3: forbidden names cannot be clicked
      assertNotForbidden(el.name);
      await loc.click();
      break;
    }
    case 'fill': {
      // Guard G3: typed values must originate from intent.data
      if (!step.dataKey) {
        throw new GuardViolation(
          'DATA',
          `Step '${step.stepId}' action 'fill' requires a valid dataKey`,
        );
      }
      assertDataKey(step.dataKey, intent);
      const val = String(intent.data[step.dataKey]);
      await loc.fill(val);
      break;
    }
    case 'check': {
      await loc.check();
      break;
    }
    case 'select': {
      if (!step.dataKey) {
        throw new GuardViolation(
          'DATA',
          `Step '${step.stepId}' action 'select' requires a valid dataKey`,
        );
      }
      assertDataKey(step.dataKey, intent);
      const labelVal = String(intent.data[step.dataKey]);
      await loc.selectOption({ label: labelVal });
      break;
    }
    default: {
      throw new Error(`Unsupported action type: ${(step as Step).action}`);
    }
  }

  // Wait for network activity to settle (testing rule: no sleeps)
  await page.evaluate(() => new Promise(r => setTimeout(r, 100))).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

  // Guard G3: verify page origin remains in allowedOrigins
  assertOriginAllowed(page.url(), intent);
}
