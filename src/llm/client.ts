/**
 * LLM Client interface and null implementation — PRD §10.4 / §11
 */

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

export function makeLlm(mode: string = 'off'): LlmClient {
  if (mode === 'off') {
    return new NullClient();
  }
  throw new Error(`Unsupported LLM mode: ${mode}`);
}
