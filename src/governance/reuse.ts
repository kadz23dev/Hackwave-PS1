/**
 * Plan lookup and reuse governance — PRD §11 step 5
 */

import type { Repo } from '../db/repo.js';
import type { Step } from '../types.js';

export interface StoredPlan {
  id: number;
  stepPlanId: number;
  steps: Step[];
  startHash?: string;
  repairId: number | null;
}

export function findPlanForRun(
  repo: Repo,
  intentId: number,
  siteId: number,
  startHash?: string
): StoredPlan | null {
  void startHash;
  const kg = repo.currentKnownGood(intentId, siteId);
  if (!kg || !kg.steps || !Array.isArray(kg.steps)) {
    return null;
  }
  return {
    id: kg.step_plan_id ?? kg.id,
    stepPlanId: kg.step_plan_id ?? kg.id,
    steps: kg.steps as Step[],
    startHash: kg.start_hash,
    repairId: kg.repair_id ?? null,
  };
}
