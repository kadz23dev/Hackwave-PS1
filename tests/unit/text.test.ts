import { describe, it, expect } from 'vitest';
import { levenshtein, levRatio, tokenSetRatio, norm } from '../../src/match/text.js';
import { synonymBoost } from '../../src/match/synonyms.js';

describe('text utils', () => {
  it('levenshtein("kitten","sitting") === 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('levenshtein identical strings === 0', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
    expect(levRatio('hello', 'hello')).toBe(1);
  });

  it('tokenSetRatio("add to cart","add to bag") > 0.6', () => {
    expect(tokenSetRatio('add to cart', 'add to bag')).toBeGreaterThan(0.6);
  });

  it('tokenSetRatio("","") === 0 (empty → 0)', () => {
    expect(tokenSetRatio('', '')).toBe(0);
  });

  it('tokenSetRatio one empty → 0', () => {
    expect(tokenSetRatio('checkout', '')).toBe(0);
    expect(tokenSetRatio('', 'checkout')).toBe(0);
  });

  it('tokenSetRatio("checkout","checkout") === 1', () => {
    expect(tokenSetRatio('checkout', 'checkout')).toBe(1);
  });

  it('norm lowercases, strips punctuation, replaces digits', () => {
    expect(norm('Cart (1)')).toBe('cart #');
    expect(norm('Add to Cart!')).toBe('add to cart');
  });

  it('synonymBoost lifts "Checkout" vs "Proceed to payment" to ≥ 0.85', () => {
    const rawSim = tokenSetRatio(norm('Checkout'), norm('Proceed to payment'));
    const boosted = synonymBoost('Checkout', 'Proceed to payment', rawSim);
    expect(boosted).toBeGreaterThanOrEqual(0.85);
  });
});
