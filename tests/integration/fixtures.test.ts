import { describe, it, expect } from 'vitest';
import { startFixture } from '../helpers/fixtures.js';

describe('fixtures integration', () => {
  it('fixture v1 starts and /__state is empty', async () => {
    const fixture = await startFixture('shop-v1');
    try {
      const res = await fetch(`${fixture.url}/__state`);
      expect(res.status).toBe(200);
      const data = await res.json() as { orders: unknown[] };
      expect(data.orders).toHaveLength(0);
    } finally {
      await fixture.stop();
    }
  });
});
