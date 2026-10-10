/**
 * Heuristic Planner — PRD §10.4
 */

import type { ActionType, ElementRecord, Intent, PageSnapshot, Step } from '../types.js';
import { FIELD_PATTERNS, FORBIDDEN_NAME, type StageId, stageOf } from './lexicon.js';
import { norm } from '../match/text.js';

export type PlannedAction =
  | { kind: 'act'; action: ActionType; ref: string; dataKey: string | null; stage?: StageId }
  | { kind: 'done' }
  | { kind: 'stuck'; reason: string }
  | { kind: 'ambiguous'; candidates: ElementRecord[] };

export function nextAction(s: {
  snap: PageSnapshot;
  intent: Intent;
  completedSteps: Step[];
  clickedOnPath: Set<string>;
}): PlannedAction {
  // 1. Done check
  const doneRe = new RegExp(s.intent.planner.doneWhen.pathPattern);
  if (doneRe.test(s.snap.pagePath)) {
    return { kind: 'done' };
  }

  // 2. Fill: First textbox with empty === true matching FIELD_PATTERNS
  const textboxes = s.snap.elements.filter(
    e => e.visible && e.enabled && e.role === 'textbox' && (e.empty === true || e.empty === undefined)
  );
  for (const tb of textboxes) {
    const fieldText = tb.label || tb.name || tb.attrs?.placeholder || '';
    for (const [key, pattern] of FIELD_PATTERNS) {
      if (pattern.test(fieldText) && Object.prototype.hasOwnProperty.call(s.intent.data, key)) {
        return { kind: 'act', action: 'fill', ref: tb.ref, dataKey: key };
      }
    }
  }

  // 3. Check: First unchecked checkbox matching agree/terms/accept
  const checkboxes = s.snap.elements.filter(
    e => e.visible && e.enabled && e.role === 'checkbox' && (e.checked === false || e.checked === null || e.checked === undefined)
  );
  for (const cb of checkboxes) {
    const cbText = cb.name || cb.label || '';
    if (/\b(agree|terms|accept)\b/i.test(cbText)) {
      return { kind: 'act', action: 'check', ref: cb.ref, dataKey: null };
    }
  }

  // 4. Click
  const productAdded = s.completedSteps.some(
    st => st.action === 'click' && stageOf(st.target.name) === 'add'
  );

  const STAGE_ORDER: StageId[] = ['pay', 'checkout', 'continue', 'cart', 'add'];

  for (const stage of STAGE_ORDER) {
    // skip add if productAdded
    if (stage === 'add' && productAdded) {
      continue;
    }

    // skip cart if !productAdded or if current page heading already contains cart/bag/basket
    if (stage === 'cart') {
      const headingHasCart = s.snap.headings.some(h => /\b(cart|bag|basket|trolley)\b/i.test(h));
      if (!productAdded || headingHasCart) {
        continue;
      }
    }

    // Candidate elements for this stage
    let candidates = s.snap.elements.filter(el => {
      if (!el.visible || !el.enabled) return false;
      if (el.role === 'textbox' || el.role === 'checkbox') return false;
      if (FORBIDDEN_NAME.test(el.name)) return false;

      const clickKey = `${s.snap.pagePath}|${norm(el.name)}|${el.nearText}`;
      if (s.clickedOnPath.has(clickKey)) return false;

      return stageOf(el.name) === stage;
    });

    if (stage === 'add' && s.intent.data.product) {
      const prod = norm(s.intent.data.product);
      candidates = candidates.filter(c => norm(c.nearText).includes(prod));
    }

    if (candidates.length === 0) {
      continue;
    }

    if (candidates.length === 1) {
      return {
        kind: 'act',
        action: 'click',
        ref: candidates[0].ref,
        dataKey: null,
        stage,
      };
    }

    // >= 2 candidates
    const firstNorm = norm(candidates[0].name);
    const allSameName = candidates.every(c => norm(c.name) === firstNorm);
    const nearTexts = new Set(candidates.map(c => c.nearText));
    const allDifferentNearText = nearTexts.size === candidates.length;

    if (allSameName && allDifferentNearText && s.intent.data.product) {
      const prod = norm(s.intent.data.product);
      const contextual = candidates.filter(c => norm(c.nearText).includes(prod));
      if (contextual.length === 1) {
        return {
          kind: 'act',
          action: 'click',
          ref: contextual[0].ref,
          dataKey: null,
          stage,
        };
      }
    }

    return {
      kind: 'ambiguous',
      candidates,
    };
  }

  // 5. Stuck
  return { kind: 'stuck', reason: `No matching action found on ${s.snap.pagePath}` };
}
