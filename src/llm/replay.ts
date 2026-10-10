/**
 * LLM Replay and Record Client — PRD §10.4 / §10.6
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LlmClient } from './client.js';
import { HOME, LLM_MODEL } from '../config.js';
import { GeminiClient } from './gemini.js';

export class ReplayClient implements LlmClient {
  calls = 0;
  private mode: 'record' | 'replay' | 'live';
  private inner?: LlmClient;
  private model: string;
  private cacheDir: string;

  constructor(
    mode: 'record' | 'replay' | 'live',
    inner?: LlmClient,
    model = LLM_MODEL,
    cacheDir = path.join(HOME, 'llm-cache'),
  ) {
    this.mode = mode;
    this.inner = inner;
    this.model = model;
    this.cacheDir = cacheDir;
  }

  async completeJson(system: string, user: string): Promise<unknown> {
    this.calls++;

    if (this.mode === 'live') {
      if (!this.inner) {
        this.inner = new GeminiClient(undefined, this.model);
      }
      return this.inner.completeJson(system, user);
    }

    const key = createHash('sha256')
      .update(`${this.model}\n${system}\n${user}`)
      .digest('hex');

    const filePath = path.join(this.cacheDir, `${key}.json`);

    if (this.mode === 'replay') {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
      }
      // Replay miss: return { action: 'stuck' } (never throw)
      return { action: 'stuck' };
    }

    if (this.mode === 'record') {
      if (!this.inner) {
        this.inner = new GeminiClient(undefined, this.model);
      }
      const res = await this.inner.completeJson(system, user);
      mkdirSync(this.cacheDir, { recursive: true });
      writeFileSync(filePath, JSON.stringify(res, null, 2), 'utf8');
      return res;
    }

    return { action: 'stuck' };
  }
}
