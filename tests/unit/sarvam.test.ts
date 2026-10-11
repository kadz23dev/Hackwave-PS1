import { describe, expect, it } from 'vitest';
import { SarvamClient } from '../../src/llm/sarvam.js';

describe('SarvamClient', () => {
  it('can be constructed without api key to allow caller fallback logic', () => {
    expect(() => new SarvamClient('')).not.toThrow();
  });

  it('throws a clear error when called without api key', async () => {
    const client = new SarvamClient('');
    await expect(client.completeJson('system', 'user')).rejects.toThrow('SARVAM_API_KEY is required for SarvamClient');
  });
});
