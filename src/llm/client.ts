/**
 * LLM Client interface and null implementation — PRD §10.4 / §11
 */

import { ReplayClient } from './replay.js';
import { GeminiClient } from './gemini.js';

export interface LlmClient {
  completeJson(system: string, user: string): Promise<unknown>;
  calls: number;
}

export class NullClient implements LlmClient {
  calls = 0;

  async completeJson(): Promise<unknown> {
    throw new Error('LLM disabled');
  }
}

export function makeLlm(mode: string = 'off', inner?: LlmClient): LlmClient {
  if (mode === 'off') {
    return new NullClient();
  }
  if (mode === 'replay') {
    return new ReplayClient('replay', inner);
  }
  if (mode === 'record') {
    return new ReplayClient('record', inner);
  }
  if (mode === 'live') {
    return inner ?? new GeminiClient();
  }
  throw new Error(`Unsupported LLM mode: ${mode}`);
}

