import { createHash } from 'node:crypto';
import type { ElementRecord } from '../types.js';

export function normalizeName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

export function contentHash(elements: ElementRecord[]): string {
  const mapped = elements.map(e => {
    const dataAttrs = Object.entries(e.attrs || {})
      .filter(([k]) => k.startsWith('data-') && k !== 'data-healtest-ref')
      .sort(([a], [b]) => a.localeCompare(b));

    return [
      e.role,
      normalizeName(e.name),
      e.tag,
      e.attrs?.id ?? '',
      e.attrs?.name ?? '',
      e.attrs?.type ?? '',
      dataAttrs,
    ];
  });

  const sorted = [...mapped].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  return createHash('sha256')
    .update(JSON.stringify(sorted))
    .digest('hex');
}
