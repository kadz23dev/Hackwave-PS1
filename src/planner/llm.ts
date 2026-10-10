/**
 * LLM Planner fallback — PRD §10.4
 * Guardrails: data KEYS only (never values), observed elements only (G2),
 * data keys in intent only (G3), no AI verdicts (G5).
 */

import { z } from 'zod';
import type { Intent, PageSnapshot, Step } from '../types.js';
import type { LlmClient } from '../llm/client.js';

export const LlmActionReplySchema = z
  .object({
    action: z.enum(['click', 'fill', 'check', 'done', 'stuck']),
    ref: z.string().nullable(),
    dataKey: z.string().nullable(),
    reason: z.string(),
  })
  .strict();

export type LlmActionReply = z.infer<typeof LlmActionReplySchema>;

export interface LlmPlannerState {
  snap: PageSnapshot;
  intent: Intent;
  completedSteps: Step[];
}

export type LlmActionResult =
  | { kind: 'act'; action: 'click' | 'fill' | 'check'; ref: string; dataKey: string | null }
  | { kind: 'done' }
  | { kind: 'stuck' };

export class LlmPlanner {
  /**
   * Build prompts per PRD §10.4:
   * Goal, data keys ONLY (never values), completed steps, current path, headings, elements.
   */
  static buildPrompt(state: LlmPlannerState): { system: string; user: string } {
    const system =
      'You are a web automation planner. Select the next action to achieve the goal based on the observed elements. Return JSON matching the schema.';

    // STRICT: ONLY the keys of intent.data, NEVER the values!
    const dataKeys = Object.keys(state.intent.data).join(', ');

    const completed =
      state.completedSteps.length > 0
        ? state.completedSteps
            .map(s => `${s.stepId}: ${s.action} '${s.target.name}' on ${s.pagePath}`)
            .join('\n')
        : 'none';

    const headings = state.snap.headings.join(', ') || 'none';

    const elementLines = state.snap.elements
      .filter(e => e.visible)
      .map(
        e =>
          `${e.ref} | ${e.role} | "${e.name}" | near:"${e.nearText}" | ${e.enabled ? 'enabled' : 'disabled'}`
      )
      .join('\n');

    const user = [
      `Goal: ${state.intent.goal}`,
      `Available data keys: [${dataKeys}]`,
      `Completed steps:`,
      completed,
      `Current path: ${state.snap.pagePath}`,
      `Headings: ${headings}`,
      `Elements:`,
      elementLines,
      '',
      `Reply with JSON matching: {"action":"click|fill|check|done|stuck","ref":"<ref>|null","dataKey":"<key>|null","reason":"..."}`,
    ].join('\n');

    return { system, user };
  }

  static async nextAction(
    state: LlmPlannerState,
    llm: LlmClient
  ): Promise<LlmActionResult> {
    const { system, user } = this.buildPrompt(state);

    let raw: unknown;
    try {
      raw = await llm.completeJson(system, user);
    } catch {
      return { kind: 'stuck' };
    }

    const parsed = LlmActionReplySchema.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'stuck' };
    }

    const { action, ref, dataKey } = parsed.data;

    if (action === 'done') {
      return { kind: 'done' };
    }

    if (action === 'stuck') {
      return { kind: 'stuck' };
    }

    // click, fill, check require a valid ref
    if (!ref) {
      return { kind: 'stuck' };
    }

    // G2: ref must exist in the current snapshot
    const el = state.snap.elements.find(e => e.ref === ref);
    if (!el) {
      return { kind: 'stuck' };
    }

    // G3: fill action must have dataKey present in intent.data
    if (action === 'fill') {
      if (!dataKey || !Object.hasOwn(state.intent.data, dataKey)) {
        return { kind: 'stuck' };
      }
    }

    return {
      kind: 'act',
      action,
      ref,
      dataKey: dataKey ?? null,
    };
  }
}
