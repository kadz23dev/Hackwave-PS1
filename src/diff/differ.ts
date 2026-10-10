/**
 * diffSnapshots(base, head) — PRD §10.3
 * Steps 1-5: greedy pair, classify changes, unpaired→removed/added, sort by priority.
 * FLOW_CHANGED is NOT produced here (repair engine adds it).
 */

import type { ChangeItem, PageSnapshot } from '../types.js';
import { similarity } from '../match/score.js';
import { elementToTarget } from '../match/score.js';
import { norm } from '../match/text.js';

const KIND_PRIORITY: Record<string, number> = {
  FLOW_CHANGED: 7,
  ELEMENT_REMOVED: 6,
  ELEMENT_RENAMED: 5,
  ATTR_CHANGED: 4,
  ELEMENT_MOVED: 3,
  ELEMENT_ADDED: 2,
  LAYOUT_SHIFT: 1,
};

function centerOf(bbox: { x: number; y: number; w: number; h: number }) {
  return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function diffSnapshots(base: PageSnapshot, head: PageSnapshot): ChangeItem[] {
  const items: ChangeItem[] = [];

  const baseId = base.id ?? 0;
  const pairedHead = new Set<string>();

  // Step 1 & 2: greedy pair base→head
  for (const bEl of base.elements) {
    const bTarget = elementToTarget(bEl, baseId);

    // Find best unpaired head element
    let bestScore = -1;
    let bestHEl: typeof head.elements[number] | null = null;
    for (const hEl of head.elements) {
      if (pairedHead.has(hEl.ref)) continue;
      const s = similarity(bTarget, hEl);
      if (s > bestScore) {
        bestScore = s;
        bestHEl = hEl;
      }
    }

    if (!bestHEl || bestScore < 0.45) {
      // Step 3a: unpaired base → ELEMENT_REMOVED
      items.push({
        kind: 'ELEMENT_REMOVED',
        before: { ...bEl, pagePath: base.pagePath },
        after: null,
        evidence: `'${bEl.name}' (${bEl.role}) removed`,
      });
      continue;
    }

    pairedHead.add(bestHEl.ref);
    const hEl = bestHEl;

    // Step 2: classify the pair
    // ELEMENT_RENAMED
    if (norm(bEl.name) !== norm(hEl.name)) {
      items.push({
        kind: 'ELEMENT_RENAMED',
        before: { ...bEl, pagePath: base.pagePath },
        after: { ...hEl, pagePath: head.pagePath },
        evidence: `name '${bEl.name}'→'${hEl.name}'`,
      });
    }

    // ATTR_CHANGED: id, data-testid, name, or selector changed
    const bSel = bEl.selector;
    const hSel = hEl.selector;
    const attrChanged =
      bEl.attrs['id'] !== hEl.attrs['id'] ||
      bEl.attrs['data-testid'] !== hEl.attrs['data-testid'] ||
      bEl.attrs['name'] !== hEl.attrs['name'] ||
      // class-free selector changed
      bSel !== hSel;

    if (attrChanged) {
      const evidenceParts: string[] = [];
      if (bEl.attrs['id'] && !hEl.attrs['id']) {
        evidenceParts.push(`id '${bEl.attrs['id']}' removed`);
      } else if (bEl.attrs['id'] !== hEl.attrs['id']) {
        evidenceParts.push(`id '${bEl.attrs['id']}'→'${hEl.attrs['id'] ?? ''}'`);
      }
      if (bSel !== hSel) {
        evidenceParts.push(`selector changed`);
      }
      items.push({
        kind: 'ATTR_CHANGED',
        before: { ...bEl, pagePath: base.pagePath },
        after: { ...hEl, pagePath: head.pagePath },
        evidence: evidenceParts.join(', ') || 'attrs changed',
      });
    }

    // ELEMENT_MOVED / LAYOUT_SHIFT
    const bCenter = centerOf(bEl.bbox);
    const hCenter = centerOf(hEl.bbox);
    const d = dist(bCenter, hCenter);
    if (d > 120) {
      items.push({
        kind: 'ELEMENT_MOVED',
        before: { ...bEl, pagePath: base.pagePath },
        after: { ...hEl, pagePath: head.pagePath },
        evidence: `moved ${Math.round(d)}px`,
      });
    } else if (d >= 24) {
      items.push({
        kind: 'LAYOUT_SHIFT',
        before: { ...bEl, pagePath: base.pagePath },
        after: { ...hEl, pagePath: head.pagePath },
        evidence: `shifted ${Math.round(d)}px`,
      });
    }
  }

  // Step 3b: unpaired head elements → ELEMENT_ADDED
  for (const hEl of head.elements) {
    if (!pairedHead.has(hEl.ref)) {
      items.push({
        kind: 'ELEMENT_ADDED',
        before: null,
        after: { ...hEl, pagePath: head.pagePath },
        evidence: `'${hEl.name}' (${hEl.role}) added`,
      });
    }
  }

  // Step 5: sort by kind priority (descending)
  items.sort((a, b) => (KIND_PRIORITY[b.kind] ?? 0) - (KIND_PRIORITY[a.kind] ?? 0));

  return items;
}

/** Export priority map for use in severity/report */
export { KIND_PRIORITY };
