/**
 * Synonym groups — PRD §10.1
 * synonymBoost(a, b, sim): if norm(a) and norm(b) both contain a phrase
 * from the SAME group → return max(sim, 0.85), else return sim.
 */

export const SYNONYM_GROUPS: string[][] = [
  ['cart', 'bag', 'basket', 'trolley', 'shopping bag'],
  ['add to cart', 'add to bag', 'add to basket'],
  ['checkout', 'check out', 'proceed to payment', 'proceed to checkout', 'go to payment'],
  ['pay now', 'pay', 'place order', 'complete order', 'confirm order', 'complete purchase'],
  ['card number', 'card no', 'credit card', 'cc number'],
  ['expiry', 'expiry date', 'expiration', 'exp date', 'mm yy'],
  ['cvc', 'cvv', 'security code'],
  ['email', 'email address', 'e mail'],
  ['address', 'shipping address', 'street address', 'delivery address'],
  ['full name', 'name', 'cardholder name'],
  ['continue', 'next'],
];

import { norm } from './text.js';

function findBestGroup(normStr: string): number {
  let bestLen = 0;
  let bestGroupIdx = -1;
  for (let i = 0; i < SYNONYM_GROUPS.length; i++) {
    for (const phrase of SYNONYM_GROUPS[i]) {
      const np = norm(phrase);
      if (normStr.includes(np)) {
        if (np.length > bestLen) {
          bestLen = np.length;
          bestGroupIdx = i;
        }
      }
    }
  }
  return bestGroupIdx;
}

export function synonymBoost(a: string, b: string, sim: number): number {
  const na = norm(a);
  const nb = norm(b);
  const groupA = findBestGroup(na);
  const groupB = findBestGroup(nb);
  if (groupA !== -1 && groupA === groupB) {
    return Math.max(sim, 0.85);
  }
  return sim;
}
