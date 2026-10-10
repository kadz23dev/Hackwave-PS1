import { FORBIDDEN_NAME } from '../planner/lexicon.js';

export class GuardViolation extends Error {
  constructor(
    public code: 'ORIGIN' | 'DATA' | 'BUDGET' | 'UNOBSERVED' | 'FORBIDDEN',
    msg: string,
  ) {
    super(msg);
    this.name = 'GuardViolation';
  }
}

/**
 * assertOriginAllowed(url, intent):
 * new URL(url).origin must equal one entry of intent.allowedOrigins
 * (compare origins, not string prefixes) — about:blank is allowed.
 */
export function assertOriginAllowed(
  url: string,
  intent: { allowedOrigins: string[] },
): void {
  if (!url || url === 'about:blank' || url.startsWith('about:')) {
    return;
  }

  try {
    const urlOrigin = new URL(url).origin;
    const isAllowed = intent.allowedOrigins.some(entry => {
      try {
        return new URL(entry).origin === urlOrigin;
      } catch {
        return entry === urlOrigin;
      }
    });

    if (!isAllowed) {
      throw new GuardViolation(
        'ORIGIN',
        `Origin '${urlOrigin}' is not in allowedOrigins: ${JSON.stringify(intent.allowedOrigins)}`,
      );
    }
  } catch (err) {
    if (err instanceof GuardViolation) throw err;
    throw new GuardViolation('ORIGIN', `Invalid URL or unparseable origin: ${url}`);
  }
}

/**
 * assertDataKey(key, intent):
 * Object.hasOwn(intent.data, key) must be true.
 */
export function assertDataKey(
  key: string,
  intent: { data: Record<string, unknown> },
): void {
  if (!key || !Object.hasOwn(intent.data, key)) {
    throw new GuardViolation(
      'DATA',
      `Data key '${key}' does not exist in intent.data: ${JSON.stringify(Object.keys(intent.data))}`,
    );
  }
}

/**
 * assertBudget(count, intent):
 * count <= intent.actionBudget
 */
export function assertBudget(
  count: number,
  intent: { actionBudget: number },
): void {
  if (count > intent.actionBudget) {
    throw new GuardViolation(
      'BUDGET',
      `Exceeded action budget: executed ${count} steps > budget ${intent.actionBudget}`,
    );
  }
}

/**
 * assertObserved(ref, snap):
 * snap.elements.some(e => e.ref === ref) must be true.
 */
export function assertObserved(
  ref: string,
  snap: { elements: Array<{ ref: string }> },
): void {
  const found = snap.elements.some(e => e.ref === ref);
  if (!found) {
    throw new GuardViolation(
      'UNOBSERVED',
      `Element ref '${ref}' was not observed in the current snapshot`,
    );
  }
}

/**
 * assertNotForbidden(name):
 * !FORBIDDEN_NAME.test(name)
 */
export function assertNotForbidden(name: string): void {
  if (FORBIDDEN_NAME.test(name)) {
    throw new GuardViolation(
      'FORBIDDEN',
      `Action targeted forbidden element name '${name}'`,
    );
  }
}
