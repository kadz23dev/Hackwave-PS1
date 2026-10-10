/**
 * Text normalization according to PRD §10.1:
 * Lowercase, strip punctuation except spaces, collapse whitespace, replace digit runs with #.
 */
export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w\s#]|_/g, ' ')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}
