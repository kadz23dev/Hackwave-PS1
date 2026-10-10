/**
 * similarity(t, e) — PRD §10.1 exact weights:
 *   0.35*nameSim + 0.20*roleSim + 0.15*attrSim + 0.10*textSim + 0.10*nearSim + 0.10*posSim
 *
 * elementToTarget(e, snapshotId): build a TargetFingerprint from an ElementRecord.
 */

import type { ElementRecord, TargetFingerprint } from '../types.js';
import { norm, tokenSetRatio } from './text.js';
import { synonymBoost } from './synonyms.js';

function isClickable(role: string): boolean {
  return role === 'button' || role === 'link';
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function center(bbox: { x: number; y: number; w: number; h: number }) {
  return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
}

export function similarity(t: TargetFingerprint, e: ElementRecord): number {
  // nameSim
  const rawNameSim = tokenSetRatio(norm(t.name), norm(e.name));
  const nameSim = synonymBoost(t.name, e.name, rawNameSim);

  // roleSim
  let roleSim: number;
  if (t.role === e.role) {
    roleSim = 1;
  } else if (isClickable(t.role) && isClickable(e.role)) {
    roleSim = 0.5;
  } else {
    roleSim = 0;
  }

  // attrSim
  const attrKeys = ['id', 'name', 'type', 'placeholder', 'data-testid'] as const;
  const tAttrsPresent = attrKeys.filter(k => t.attrs[k]);
  const matches = tAttrsPresent.filter(k => t.attrs[k] && t.attrs[k] === e.attrs[k]);
  const attrSim = matches.length / Math.max(1, tAttrsPresent.length);

  // textSim
  const labelSim = tokenSetRatio(t.label, e.label);
  const textBoost = synonymBoost(t.text, e.text, tokenSetRatio(t.text, e.text));
  const textSim = Math.max(labelSim, textBoost);

  // nearSim
  const nearSim = tokenSetRatio(norm(t.nearText), norm(e.nearText));

  // posSim
  const d = dist(center(t.bbox), center(e.bbox));
  const posSim = 1 - Math.min(1, d / 640);

  return (
    0.35 * nameSim +
    0.20 * roleSim +
    0.15 * attrSim +
    0.10 * textSim +
    0.10 * nearSim +
    0.10 * posSim
  );
}

export function elementToTarget(e: ElementRecord, snapshotId: number): TargetFingerprint {
  return {
    role: e.role,
    name: e.name,
    tag: e.tag,
    text: e.text,
    label: e.label,
    attrs: { ...e.attrs },
    nearText: e.nearText,
    bbox: { ...e.bbox },
    selector: e.selector,
    snapshotId,
    ref: e.ref,
  };
}
