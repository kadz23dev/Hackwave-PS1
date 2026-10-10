import type { ChangeItem, ChangeReport, Classification, PageSnapshot, Severity } from '../types.js';
import { KIND_PRIORITY } from './differ.js';
import { severity as computeSeverity } from './severity.js';

export interface BuildChangeReportArgs {
  base?: PageSnapshot;
  head?: PageSnapshot;
  baseSnapshotId?: number;
  headSnapshotId?: number;
  items: ChangeItem[];
  affectedSteps: string[];
  classification: Classification;
  confidence: number;
  explanation: string;
  severity?: Severity;
  oracleFailed?: boolean;
  appError?: boolean;
}

export function buildChangeReport(
  args: BuildChangeReportArgs
): Omit<ChangeReport, 'changeId'> {
  const sortedItems = [...args.items].sort(
    (a, b) => (KIND_PRIORITY[b.kind] ?? 0) - (KIND_PRIORITY[a.kind] ?? 0)
  );

  const kind = sortedItems.length > 0 ? sortedItems[0].kind : 'ELEMENT_RENAMED';

  const baseSnapshotId = args.baseSnapshotId ?? args.base?.id ?? 0;
  const headSnapshotId = args.headSnapshotId ?? args.head?.id ?? 0;

  const sev =
    args.severity ??
    computeSeverity(
      sortedItems,
      args.affectedSteps,
      Boolean(args.oracleFailed),
      Boolean(args.appError)
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
