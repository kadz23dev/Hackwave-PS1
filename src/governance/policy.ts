import { z } from 'zod';
import { readFileSync } from 'node:fs';

const PolicySchema = z.object({
  autoAccept: z.object({
    classification: z.array(z.string()),
    maxCandidates: z.number(),
    requireAllOracles: z.boolean(),
  }),
  match: z.object({
    strong: z.number(),
    margin: z.number(),
    selectorVerify: z.number(),
  }),
});

export type Policy = z.infer<typeof PolicySchema>;

let _cached: Policy | null = null;

export function loadPolicy(path = 'policy.json'): Policy {
  if (_cached) return _cached;
  const raw = readFileSync(path, 'utf8');
  _cached = PolicySchema.parse(JSON.parse(raw));
  return _cached;
}

/** Reset cached policy (for tests). */
export function resetPolicyCache(): void {
  _cached = null;
}
