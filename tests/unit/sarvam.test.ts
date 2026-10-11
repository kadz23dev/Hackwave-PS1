import { describe, it, expect } from 'vitest';
import { SarvamClient } from '../../src/llm/sarvam.js';

describe('SarvamClient', () => {
  it('allows construction without API key', () => {
    expect(() => new SarvamClient('')).not.toThrow();
  });

  it('requires API key when making requests', async () => {
    const client = new SarvamClient('');
    await expect(client.completeJson('system', 'user')).rejects.toThrow('SARVAM_API_KEY is required for SarvamClient');
    await expect(client.completeChat('system', 'user')).rejects.toThrow('SARVAM_API_KEY is required for SarvamClient');
  });
});
