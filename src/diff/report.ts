import type {
  ChangeItem,
  ChangeReport,
  Classification,
  Severity,
} from '../types.js';
import { KIND_PRIORITY } from './differ.js';
import { severity as computeSeverity } from './severity.js';

export interface BuildChangeReportArgs {
  base: { id?: number } | number;
  head: { id?: number } | number;
  items: ChangeItem[];
  affectedSteps: string[];
  classification: Classification;
  confidence: number;
  explanation: string;
  oracleFailed?: boolean;
  appError?: boolean;
  severity?: Severity;
}

/**
 * buildChangeReport(args) → Omit<ChangeReport, 'changeId'>
 * Sorts items by kind priority, picks items[0].kind as the report kind,
 * and determines severity via severity rules if not explicitly provided.
 */
export function buildChangeReport(
  args: BuildChangeReportArgs,
): Omit<ChangeReport, 'changeId'> {
  // Sort items by priority (descending)
  const sortedItems = [...args.items].sort(
    (a, b) => (KIND_PRIORITY[b.kind] ?? 0) - (KIND_PRIORITY[a.kind] ?? 0),
  );

  const kind = sortedItems[0]?.kind ?? 'LAYOUT_SHIFT';

  const baseSnapshotId =
    typeof args.base === 'number' ? args.base : (args.base.id ?? 0);
  const headSnapshotId =
    typeof args.head === 'number' ? args.head : (args.head.id ?? 0);

  const sev =
    args.severity ??
    computeSeverity(
      sortedItems,
      args.affectedSteps,
      args.oracleFailed ?? false,
      args.appError ?? false,
    );

  return {
    baseSnapshotId,
    headSnapshotId,
    kind,
    severity: sev,
    classification: args.classification,
    confidence: args.confidence,
    evidence: sortedItems,
    affectedSteps: args.affectedSteps,
    explanation: args.explanation,
  };
}
