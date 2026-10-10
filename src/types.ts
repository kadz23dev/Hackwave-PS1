import { z } from 'zod';

// ─── Primitive unions ────────────────────────────────────────────────────────

export const VerdictSchema = z.enum([
  'PASS',
  'HEALED_PASS',
  'APP_BUG',
  'NEEDS_REVIEW',
  'FAIL_UNREPAIRABLE',
]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const ClassificationSchema = z.enum([
  'HARMLESS_UI',
  'BREAKING_UI',
  'APP_BUG',
  'AMBIGUOUS',
]);
export type Classification = z.infer<typeof ClassificationSchema>;

export const SeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type Severity = z.infer<typeof SeveritySchema>;

export const ChangeKindSchema = z.enum([
  'ELEMENT_RENAMED',
  'ELEMENT_REMOVED',
  'ELEMENT_ADDED',
  'ELEMENT_MOVED',
  'ATTR_CHANGED',
  'LAYOUT_SHIFT',
  'FLOW_CHANGED',
]);
export type ChangeKind = z.infer<typeof ChangeKindSchema>;

export const ActionTypeSchema = z.enum(['click', 'fill', 'check', 'select']);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ProvenanceSchema = z.enum([
  'planner',
  'replay',
  'repair-match',
  'repair-replan',
  'llm',
  'human',
]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ─── Structs ────────────────────────────────────────────────────────────────

export const BBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type BBox = z.infer<typeof BBoxSchema>;

export const ElementRecordSchema = z.object({
  ref: z.string(),
  role: z.string(),
  name: z.string(),
  tag: z.string(),
  text: z.string(),
  label: z.string(),
  attrs: z.record(z.string(), z.string()),
  nearText: z.string(),
  bbox: BBoxSchema,
  visible: z.boolean(),
  enabled: z.boolean(),
  empty: z.boolean(),
  checked: z.boolean().nullable(),
  selector: z.string(),
});
export type ElementRecord = z.infer<typeof ElementRecordSchema>;

export const PageSnapshotSchema = z.object({
  id: z.number().optional(),
  pagePath: z.string(),
  url: z.string(),
  title: z.string(),
  headings: z.array(z.string()),
  elements: z.array(ElementRecordSchema),
  ariaYaml: z.string(),
  contentHash: z.string(),
  screenshotPath: z.string().nullable(),
});
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;

export const TargetFingerprintSchema = z.object({
  role: z.string(),
  name: z.string(),
  tag: z.string(),
  text: z.string(),
  label: z.string(),
  attrs: z.record(z.string(), z.string()),
  nearText: z.string(),
  bbox: BBoxSchema,
  selector: z.string(),
  snapshotId: z.number(),
  ref: z.string(),
});
export type TargetFingerprint = z.infer<typeof TargetFingerprintSchema>;

export const StepSchema = z.object({
  stepId: z.string(),
  action: ActionTypeSchema,
  pagePath: z.string(),
  target: TargetFingerprintSchema,
  dataKey: z.string().nullable(),
  provenance: ProvenanceSchema,
});
export type Step = z.infer<typeof StepSchema>;

export const CandidateSchema = z.object({
  ref: z.string(),
  snapshotId: z.number(),
  score: z.number(),
  role: z.string(),
  name: z.string(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const MatchResultSchema = z.object({
  kind: z.enum(['single', 'ambiguous', 'none']),
  best: CandidateSchema.nullable(),
  candidates: z.array(CandidateSchema),
  reason: z.string(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

export const NetworkEventSchema = z.object({
  method: z.string(),
  url: z.string(),
  path: z.string(),
  status: z.number(),
  ts: z.number(),
});
export type NetworkEvent = z.infer<typeof NetworkEventSchema>;

export const OracleResultSchema = z.object({
  oracleId: z.string(),
  type: z.string(),
  ok: z.boolean(),
  supportingOnly: z.boolean(),
  detail: z.record(z.string(), z.unknown()),
});
export type OracleResult = z.infer<typeof OracleResultSchema>;

export const ChangeItemSchema = z.object({
  kind: ChangeKindSchema,
  before: z.union([
    z.intersection(
      ElementRecordSchema.partial(),
      z.object({ pagePath: z.string().optional() }),
    ),
    z.null(),
  ]),
  after: z.union([
    z.intersection(
      ElementRecordSchema.partial(),
      z.object({ pagePath: z.string().optional(), snapshotElementId: z.string().optional() }),
    ),
    z.null(),
  ]),
  evidence: z.string(),
});
export type ChangeItem = z.infer<typeof ChangeItemSchema>;

export const ChangeReportSchema = z.object({
  changeId: z.number(),
  baseSnapshotId: z.number(),
  headSnapshotId: z.number(),
  kind: ChangeKindSchema,
  severity: SeveritySchema,
  classification: ClassificationSchema,
  confidence: z.number(),
  evidence: z.array(ChangeItemSchema),
  affectedSteps: z.array(z.string()),
  explanation: z.string(),
});
export type ChangeReport = z.infer<typeof ChangeReportSchema>;

export const RepairProposalSchema = z.object({
  repairId: z.number(),
  changeId: z.number(),
  proposer: z.enum(['heuristic', 'llm', 'reuse']),
  status: z.enum([
    'proposed',
    'needs_review',
    'validated',
    'rejected',
    'approved',
    'applied',
    'rolled_back',
  ]),
  steps: z.array(
    StepSchema.and(
      z.object({
        score: z.number().optional(),
        alternatives: z.array(CandidateSchema).optional(),
      }),
    ),
  ),
  pendingChoice: z
    .object({ stepId: z.string(), candidates: z.array(CandidateSchema) })
    .nullable(),
  explanation: z.string(),
  validationRunId: z.number().nullable(),
});
export type RepairProposal = z.infer<typeof RepairProposalSchema>;

export const RunOutcomeSchema = z.object({
  runId: z.number(),
  verdict: VerdictSchema,
  exitCode: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(10),
    z.literal(11),
    z.literal(12),
  ]),
  classification: ClassificationSchema.nullable(),
  changeIds: z.array(z.number()),
  repairId: z.number().nullable(),
  validationRunId: z.number().nullable(),
  reusedRepairId: z.number().nullable(),
  llmCalls: z.number(),
  explanation: z.string(),
  oracleResults: z.array(OracleResultSchema),
});
export type RunOutcome = z.infer<typeof RunOutcomeSchema>;

// ─── Intent §8.1 ────────────────────────────────────────────────────────────

// Oracle discriminated-union members

const BackendStateOracleSchema = z
  .object({
    id: z.string(),
    type: z.literal('backend_state'),
    request: z
      .object({ method: z.string(), path: z.string() })
      .strict(),
    select: z.string(),
    where: z.record(z.string(), z.string()),
    expect: z
      .object({
        count: z.number().optional(),
        fields: z.record(z.string(), z.string()),
      })
      .strict(),
  })
  .strict();

const NetworkStatusOracleSchema = z
  .object({
    id: z.string(),
    type: z.literal('network_status'),
    urlPattern: z.string(),
    method: z.string().optional(),
    forbidStatusAtLeast: z.number().optional(),
    requireStatusIn: z.array(z.number()).optional(),
  })
  .strict();

const DomStateOracleSchema = z
  .object({
    id: z.string(),
    type: z.literal('dom_state'),
    textAny: z.array(z.string()),
    supportingOnly: z.boolean().default(true),
  })
  .strict();

export const IntentSchema = z
  .object({
    name: z.string(),
    site: z.string(),
    goal: z.string(),
    startPath: z.string(),
    allowedOrigins: z.array(z.string()),
    actionBudget: z.number(),
    data: z.record(z.string(), z.string()),
    planner: z
      .object({
        doneWhen: z.object({ pathPattern: z.string() }).strict(),
      })
      .strict(),
    expected: z.array(
      z.discriminatedUnion('type', [
        BackendStateOracleSchema,
        NetworkStatusOracleSchema,
        DomStateOracleSchema,
      ]),
    ),
  })
  .strict();

export type Intent = z.infer<typeof IntentSchema>;
