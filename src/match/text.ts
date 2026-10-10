/**
 * Text utilities — PRD §10.1
 *
 * levenshtein(a,b): iterative two-row DP, O(n·m) time O(m) space.
 * levRatio(a,b):    1 - lev / max(len(a),len(b),1)
 * tokenSetRatio(a,b): token-set similarity; EMPTY → 0
 * norm(s):          lowercase, strip punctuation (keep spaces), collapse whitespace, replace digit runs with #
 */

export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w\s#]|_/g, ' ')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Use two rows
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function levRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * tokenSetRatio(a, b):
 *  - If either string (after splitting into tokens) is empty → return 0.
 *  - Build intersection I, then sI, sA (sI + A\I), sB (sI + B\I).
 *  - Return max(levRatio(sI,sA), levRatio(sI,sB), levRatio(sA,sB)).
 */
export function tokenSetRatio(a: string, b: string): number {
  const tokA = a.trim().split(/\s+/).filter(Boolean);
  const tokB = b.trim().split(/\s+/).filter(Boolean);
  if (tokA.length === 0 || tokB.length === 0) return 0;

  const setA = new Set(tokA);
  const setB = new Set(tokB);
  const I = [...setA].filter(t => setB.has(t)).sort();
  const aOnly = [...setA].filter(t => !setB.has(t)).sort();
  const bOnly = [...setB].filter(t => !setA.has(t)).sort();

  const sI = I.join(' ');
  const sA = [sI, ...aOnly].join(' ').trim();
  const sB = [sI, ...bOnly].join(' ').trim();

  return Math.max(levRatio(sI, sA), levRatio(sI, sB), levRatio(sA, sB));
}
