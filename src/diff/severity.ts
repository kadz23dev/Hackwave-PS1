import type { ChangeItem, Severity } from '../types.js';

/**
 * Determine deterministic change severity per PRD §10.3 and change-classification skill:
 * 1. any oracle failed or 5xx observed → CRITICAL
 * 2. FLOW_CHANGED or REMOVED affecting a step → HIGH
 * 3. RENAMED/ATTR/MOVED affecting more than one step → MEDIUM
 * 4. otherwise → LOW
 */
export function severity(
  items: ChangeItem[],
  affectedSteps: string[],
  oracleFailed: boolean,
  appError: boolean
): Severity {
  // 1. any oracle failed or 5xx observed → CRITICAL
  if (oracleFailed || appError) {
    return 'CRITICAL';
  }

  // 2. FLOW_CHANGED or REMOVED affecting a step → HIGH
  const hasFlowOrRemoved = items.some(
    i => i.kind === 'FLOW_CHANGED' || i.kind === 'ELEMENT_REMOVED'
  );
  if (hasFlowOrRemoved && affectedSteps.length > 0) {
    return 'HIGH';
  }

  // 3. RENAMED/ATTR/MOVED affecting more than one step → MEDIUM
  const hasRenamedAttrMoved = items.some(
    i =>
      i.kind === 'ELEMENT_RENAMED' ||
      i.kind === 'ATTR_CHANGED' ||
      i.kind === 'ELEMENT_MOVED'
  );
  if (hasRenamedAttrMoved && affectedSteps.length > 1) {
    return 'MEDIUM';
  }

  // 4. otherwise → LOW
  return 'LOW';
}
