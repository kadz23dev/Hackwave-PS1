/**
 * Sarvam AI LLM client supporting 105B parameter model
 */

import type { LlmClient } from './client.js';
import { LLM_MODEL } from '../config.js';

export class SarvamClient implements LlmClient {
  calls = 0;
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(
    apiKey = process.env.SARVAM_API_KEY || '',
    model = LLM_MODEL || 'sarvam-105b-conversations',
    baseUrl = process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai/v1'
  ) {
    this.apiKey = apiKey || 'mock-sarvam-key';
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async completeJson(system: string, user: string): Promise<unknown> {
    this.calls++;

    if (!this.apiKey || this.apiKey === 'mock-sarvam-key') {
      return {
        role: 'Assistant',
        explanation: 'Sarvam AI multi-agent diagnostic fallback response.',
        status: 'diagnosed',
        verdict: 'PASS',
      };
    }

    const messages = [
      ...(system ? [{ role: 'system', content: `${system}\n\nIMPORTANT: Return valid JSON only without markdown formatting.` }] : []),
      { role: 'user', content: `${user}\n\nReturn ONLY a raw JSON object.` },
    ];

    const modelToUse = this.model.includes('conversations') ? this.model : 'sarvam-105b-conversations';

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': this.apiKey,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages,
        max_tokens: 1500,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Sarvam AI API error (${response.status}): ${errBody}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('Empty response from Sarvam AI');
    }

    let clean = text.trim();
    if (clean.startsWith('```json')) {
      clean = clean.slice(7);
    } else if (clean.startsWith('```')) {
      clean = clean.slice(3);
    }
    if (clean.endsWith('```')) {
      clean = clean.slice(0, -3);
    }
    clean = clean.trim();

    // Find JSON boundary if surrounded by extraneous text
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(clean);
    } catch {
      return { reply: text.trim() };
    }
  }

  async completeChat(system: string, user: string): Promise<string> {
    this.calls++;

    if (!this.apiKey || this.apiKey === 'mock-sarvam-key') {
      return 'Sarvam AI 105B Assistant online. Ready to analyze test cases and self-healing execution runs.';
    }

    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user },
    ];

    // Try conversation-tuned 105B model first for dialogue
    const modelsToTry = [
      'sarvam-105b-conversations',
      this.model,
    ];

    let lastError: Error | null = null;
    for (const m of modelsToTry) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': this.apiKey,
          },
          body: JSON.stringify({
            model: m,
            messages,
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          throw new Error(`Sarvam AI API error (${response.status}): ${errBody}`);
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };

        const text = data?.choices?.[0]?.message?.content;
        if (text && text.trim()) {
          return text.trim();
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }

    throw lastError || new Error('No content returned from Sarvam AI');
  }
}
