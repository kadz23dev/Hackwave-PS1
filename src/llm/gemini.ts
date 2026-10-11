/**
 * Gemini LLM client using @google/genai — PRD §10.4
 */

import { GoogleGenAI } from '@google/genai';
import type { LlmClient } from './client.js';
import { LLM_MODEL, GEMINI_API_KEY } from '../config.js';

export class GeminiClient implements LlmClient {
  calls = 0;
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || GEMINI_API_KEY, model = LLM_MODEL) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is required for GeminiClient');
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async completeJson(system: string, user: string): Promise<unknown> {
    this.calls++;
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        temperature: 0,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from Gemini');
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

    return JSON.parse(clean.trim());
  }
}
