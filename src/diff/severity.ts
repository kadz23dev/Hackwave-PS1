import type { ChangeItem, Severity } from '../types.js';

/**
 * Determine change severity — PRD §10.3
 * Evaluated in deterministic order:
 * 1. any oracle failed or 5xx observed (appError) → CRITICAL
 * 2. FLOW_CHANGED or ELEMENT_REMOVED affecting a step → HIGH
 * 3. ELEMENT_RENAMED / ATTR_CHANGED / ELEMENT_MOVED affecting more than one step → MEDIUM
 * 4. otherwise → LOW
 */
export function severity(
  items: ChangeItem[],
  affectedSteps: string[],
  oracleFailed: boolean,
  appError: boolean,
): Severity {
  // 1. Any oracle failed or server error observed → CRITICAL
  if (oracleFailed || appError) {
    return 'CRITICAL';
  }

  // 2. FLOW_CHANGED or ELEMENT_REMOVED affecting a step → HIGH
  const hasStepAffected = affectedSteps.length > 0;
  if (
    hasStepAffected &&
    items.some(i => i.kind === 'FLOW_CHANGED' || i.kind === 'ELEMENT_REMOVED')
  ) {
    return 'HIGH';
  }

  // 3. RENAMED / ATTR / MOVED affecting more than one step → MEDIUM
  const affectsMultipleSteps = affectedSteps.length > 1;
  if (
    affectsMultipleSteps &&
    items.some(
      i =>
        i.kind === 'ELEMENT_RENAMED' ||
        i.kind === 'ATTR_CHANGED' ||
        i.kind === 'ELEMENT_MOVED',
    )
  ) {
    return 'MEDIUM';
  }

  // 4. Otherwise → LOW
  return 'LOW';
}
