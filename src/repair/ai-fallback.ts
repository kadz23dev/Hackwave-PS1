/**
 * AI/LLM-Based Recovery Fallback — Deterministic-First Recovery Pipeline
 * Invoked only when deterministic semantic + context-aware matching cannot safely resolve.
 * Enforces strict validation: G2 (observed elements only), role compatibility, and no guessing.
 */

import { z } from 'zod';
import type { Candidate, ElementRecord, Intent, PageSnapshot, Step, TargetFingerprint } from '../types.js';
import type { LlmClient } from '../llm/client.js';
import { NullClient } from '../llm/client.js';

export const AiRecoveryReplySchema = z
  .object({
    status: z.enum(['recovered', 'ambiguous', 'stuck']),
    recommendedRef: z.string().nullable(),
    reason: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export type AiRecoveryReply = z.infer<typeof AiRecoveryReplySchema>;

export interface AiRecoveryContext {
  step: Step;
  target: TargetFingerprint;
  snap: PageSnapshot;
  candidatesExamined: Candidate[];
  deterministicReason: string;
  intent: Intent;
}

export interface AiRecoveryResult {
  kind: 'recovered' | 'ambiguous' | 'stuck';
  candidate: ElementRecord | null;
  confidence: number;
  reason: string;
  rawReply?: AiRecoveryReply;
}

export function buildAiRecoveryPrompt(ctx: AiRecoveryContext): { system: string; user: string } {
  const system =
    'You are an expert self-healing software testing agent. A Playwright test step failed to locate its target element with the original selector, and deterministic recovery could not safely identify a unique replacement. Based on the target intent, original selector, and observed DOM elements, recommend the intended element reference. Never invent elements. If multiple candidates remain equally plausible, return status "ambiguous" with recommendedRef null. Never guess.';

  const visibleElements = ctx.snap.elements
    .filter((e) => e.visible && e.enabled)
    .map(
      (e) =>
        `[ref="${e.ref}"] <${e.tag}> role="${e.role}" name="${e.name}" nearText="${e.nearText}" selector="${e.selector}"`
    )
    .join('\n');

  const candidatesList =
    ctx.candidatesExamined.length > 0
      ? ctx.candidatesExamined
          .map((c) => `[ref="${c.ref}"] role="${c.role}" name="${c.name}" score=${c.score.toFixed(3)}`)
          .join('\n')
      : 'None meeting threshold';

  const user = [
    `Goal: ${ctx.intent.goal}`,
    `Original Step: ${ctx.step.stepId} (action: ${ctx.step.action})`,
    `Original Target: role="${ctx.target.role}" name="${ctx.target.name}" text="${ctx.target.text}" selector="${ctx.target.selector}" nearText="${ctx.target.nearText}"`,
    `Current Page Path: ${ctx.snap.pagePath} (${ctx.snap.title || 'untitled'})`,
    `Deterministic Layer Outcome: ${ctx.deterministicReason}`,
    `Candidates Already Examined with Confidence Scores:`,
    candidatesList,
    `Current Observed Visible & Enabled Elements on Page:`,
    visibleElements,
    '',
    `Reply with JSON strictly matching:`,
    `{"status":"recovered|ambiguous|stuck","recommendedRef":"<ref>|null","reason":"...","confidence":0.0-1.0}`,
    `Safety Constraint: Return "ambiguous" if evidence cannot uniquely resolve the intended element.`,
  ].join('\n');

  return { system, user };
}

export async function attemptAiRecovery(
  ctx: AiRecoveryContext,
  llm: LlmClient,
  llmMode: string = 'off'
): Promise<AiRecoveryResult> {
  if (llmMode === 'off' || llm instanceof NullClient) {
    return {
      kind: 'stuck',
      candidate: null,
      confidence: 0,
      reason: 'AI/LLM recovery is disabled or unavailable.',
    };
  }

  const { system, user } = buildAiRecoveryPrompt(ctx);
  let raw: unknown;
  try {
    raw = await llm.completeJson(system, user);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      kind: 'stuck',
      candidate: null,
      confidence: 0,
      reason: `LLM execution error: ${msg}`,
    };
  }

  const parsed = AiRecoveryReplySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      kind: 'stuck',
      candidate: null,
      confidence: 0,
      reason: 'LLM returned invalid response schema.',
    };
  }

  const { status, recommendedRef, reason, confidence = 0.88 } = parsed.data;

  if (status === 'ambiguous' || !recommendedRef) {
    return {
      kind: status === 'ambiguous' ? 'ambiguous' : 'stuck',
      candidate: null,
      confidence: 0,
      reason: reason || 'AI fallback determined choices are ambiguous.',
      rawReply: parsed.data,
    };
  }

  // 1. Validate element exists in current snapshot (Guardrail G2)
  const el = ctx.snap.elements.find((e) => e.ref === recommendedRef);
  if (!el || !el.visible || !el.enabled) {
    return {
      kind: 'stuck',
      candidate: null,
      confidence: 0,
      reason: `AI proposed ref '${recommendedRef}' which is not visible or enabled on the current page.`,
      rawReply: parsed.data,
    };
  }

  // 2. Validate role compatibility
  const sameRole = el.role === ctx.target.role;
  const bothClickable =
    (ctx.target.role === 'button' || ctx.target.role === 'link') &&
    (el.role === 'button' || el.role === 'link');

  if (!sameRole && !bothClickable && ctx.step.action === 'click') {
    return {
      kind: 'stuck',
      candidate: null,
      confidence: 0,
      reason: `AI proposed element role '${el.role}' incompatible with target action role '${ctx.target.role}'.`,
      rawReply: parsed.data,
    };
  }

  return {
    kind: 'recovered',
    candidate: el,
    confidence,
    reason,
    rawReply: parsed.data,
  };
}
