/**
 * Field lexicon, stages and forbidden names — PRD §10.4
 */

export type StageId = 'add' | 'cart' | 'checkout' | 'continue' | 'pay';

export const FIELD_PATTERNS: Array<[dataKey: string, re: RegExp]> = [
  ['email', /\be-?mail\b/i],
  ['cardNumber', /\b(card\s*(number|no\.?)|credit\s*card|cc)\b/i],
  ['expiry', /\b(expiry|expiration|exp(\.|\s)?date|mm\s*\/\s*yy)\b/i],
  ['cvc', /\b(cvc|cvv|security\s*code)\b/i],
  ['name', /\b(full\s*name|name|cardholder)\b/i],
  ['address', /\b(address|street)\b/i],
];

export const STAGES = [
  { id: 'add' as const, re: /\badd to (cart|bag|basket)\b/i },
  { id: 'cart' as const, re: /\b(cart|bag|basket|trolley)\b/i },
  { id: 'checkout' as const, re: /\b(checkout|check out|proceed to (payment|checkout)|go to payment)\b/i },
  { id: 'continue' as const, re: /\b(continue|next)\b/i },
  { id: 'pay' as const, re: /\b(pay( now)?|place order|complete order|confirm order|complete purchase)\b/i },
] as const;

export const FORBIDDEN_NAME = /\b(remove|delete|logout|log out|cancel|clear|continue shopping)\b/i;

const STAGE_MAP: Record<StageId, RegExp> = {
  pay: /\b(pay( now)?|place order|complete order|confirm order|complete purchase)\b/i,
  checkout: /\b(checkout|check out|proceed to (payment|checkout)|go to payment)\b/i,
  continue: /\b(continue|next)\b/i,
  add: /\badd to (cart|bag|basket)\b/i,
  cart: /\b(cart|bag|basket|trolley)\b/i,
};

const CHECK_ORDER: StageId[] = ['pay', 'checkout', 'continue', 'add', 'cart'];

/**
 * Check stages in order: pay, checkout, continue, add, cart;
 * return the FIRST matching (so 'Add to cart' → 'add', never 'cart').
 */
export function stageOf(name: string): StageId | null {
  for (const stage of CHECK_ORDER) {
    if (STAGE_MAP[stage].test(name)) {
      return stage;
    }
  }
  return null;
}
