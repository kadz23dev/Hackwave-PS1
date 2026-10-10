/**
 * findReplacement(t, snap, policy) — PRD §10.2 steps 1–6
 * resolveBySelector(page, snap, t, policy) — PRD §10.2 last paragraph
 */

import type { Page } from 'playwright';
import type { ElementRecord, MatchResult, PageSnapshot, TargetFingerprint, Candidate } from '../types.js';
import { norm, tokenSetRatio } from './text.js';
import { similarity } from './score.js';
import type { Policy } from '../governance/policy.js';

const FORBIDDEN_RE = /\b(remove|delete|logout|log out|cancel|clear)\b/i;

function toCandidate(e: ElementRecord, snapshotId: number, score: number): Candidate {
  return { ref: e.ref, snapshotId, score, role: e.role, name: e.name };
}

export function findReplacement(
  t: TargetFingerprint,
  snap: PageSnapshot,
  policy: Policy,
): MatchResult {
  const snapId = snap.id ?? 0;

  // Step 1: filter to visible+enabled, compatible role
  let candidates = snap.elements.filter(e => {
    if (!e.visible || !e.enabled) return false;
    const sameRole = e.role === t.role;
    const bothClickable =
      (t.role === 'button' || t.role === 'link') &&
      (e.role === 'button' || e.role === 'link');
    return sameRole || bothClickable;
  });

  // Step 2: context anchoring — if t has nearText and at least one candidate matches (≥0.9), keep only those
  if (t.nearText) {
    const anchored = candidates.filter(
      e => tokenSetRatio(norm(t.nearText), norm(e.nearText)) >= 0.9,
    );
    if (anchored.length > 0) candidates = anchored;
  }

  // Step 3: forbidden names
  candidates = candidates.filter(e => !FORBIDDEN_RE.test(norm(e.name)));

  // Step 4: score all, sort descending, keep top 5
  const scored = candidates
    .map(e => ({ e, score: similarity(t, e) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const top5: Candidate[] = scored.map(s => toCandidate(s.e, snapId, s.score));

  // Step 5: decide
  if (top5.length === 0 || top5[0].score < policy.match.strong) {
    return {
      kind: 'none',
      best: null,
      candidates: top5,
      reason: top5.length === 0
        ? 'No compatible candidates found.'
        : `Best score ${top5[0].score.toFixed(2)} < threshold ${policy.match.strong}.`,
    };
  }

  if (
    top5.length >= 2 &&
    top5[1].score >= policy.match.strong &&
    top5[0].score - top5[1].score < policy.match.margin
  ) {
    return {
      kind: 'ambiguous',
      best: top5[0],
      candidates: top5,
      reason: `Best match '${top5[0].name}' (${top5[0].role}) score ${top5[0].score.toFixed(2)}; next '${top5[1].name}' ${top5[1].score.toFixed(2)}.`,
    };
  }

  return {
    kind: 'single',
    best: top5[0],
    candidates: top5,
    reason: `Best match '${top5[0].name}' (${top5[0].role}) score ${top5[0].score.toFixed(2)}; next '${(top5[1]?.name ?? 'none')}' ${top5[1]?.score.toFixed(2) ?? '0.00'}.`,
  };
}

export async function resolveBySelector(
  page: Page,
  snap: PageSnapshot,
  t: TargetFingerprint,
  policy: Policy,
): Promise<ElementRecord | null> {
  // Find element in snapshot by selector match
  let el = snap.elements.find(e => e.selector === t.selector) ?? null;

  // Fallback: try to locate via playwright
  if (!el) {
    try {
      const count = await page.locator(t.selector).count();
      if (count === 1) {
        // Find by checking data-healtest-ref attribute
        const ref = await page.locator(t.selector).getAttribute('data-healtest-ref');
        if (ref) el = snap.elements.find(e => e.ref === ref) ?? null;
      }
    } catch {
      // locator error
    }
  }

  if (!el) return null;

  // Accept only if similarity ≥ selectorVerify
  const score = similarity(t, el);
  if (score >= policy.match.selectorVerify) return el;
  return null;
}
