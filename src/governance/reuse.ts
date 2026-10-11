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
  reusedRepairId: number | null;
  planIsKnownGood: boolean;
}

export function findPlanForRun(
  repo: Repo,
  intentId: number,
  siteId: number,
  startHash?: string
): StoredPlan | null {
  // (a) newest repair in status validated|approved|applied whose step_plan.start_hash == startHash
  if (startHash) {
    const repairRow = repo.db
      .prepare(`
        SELECT r.id AS repair_id, r.status, sp.id AS step_plan_id, sp.steps_json, sp.start_hash
        FROM repairs r
        JOIN step_plans sp ON r.step_plan_id = sp.id
        WHERE sp.intent_id = ?
          AND sp.site_id = ?
          AND sp.start_hash = ?
          AND r.status IN ('validated', 'approved', 'applied')
        ORDER BY r.id DESC
        LIMIT 1
      `)
      .get(intentId, siteId, startHash) as
      | {
          repair_id: number;
          status: string;
          step_plan_id: number;
          steps_json: string;
          start_hash: string;
        }
      | undefined;

    if (repairRow) {
      let steps: Step[] = [];
      try {
        steps = JSON.parse(repairRow.steps_json);
      } catch {
        steps = [];
      }
      const isApprovedOrApplied =
        repairRow.status === 'approved' || repairRow.status === 'applied';
      return {
        id: repairRow.step_plan_id,
        stepPlanId: repairRow.step_plan_id,
        steps,
        startHash: repairRow.start_hash,
        repairId: repairRow.repair_id,
        reusedRepairId: repairRow.repair_id,
        planIsKnownGood: isApprovedOrApplied,
      };
    }
  }

  // (b) newest known_good plan for this intent+site
  const kg = repo.currentKnownGood(intentId, siteId);
  if (kg && kg.steps && Array.isArray(kg.steps)) {
    return {
      id: kg.step_plan_id ?? kg.id,
      stepPlanId: kg.step_plan_id ?? kg.id,
      steps: kg.steps as Step[],
      startHash: kg.start_hash,
      repairId: kg.repair_id ?? null,
      reusedRepairId: null,
      planIsKnownGood: true,
    };
  }

  // (c) null
  return null;
}
