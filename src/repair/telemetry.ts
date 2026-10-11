/**
 * Telemetry, Execution Traceability & AI Workload Savings Tracker
 * PRD §10 / Requirements §5 & §6
 */

export interface StepTrace {
  stepId: string;
  originalSelector: string;
  originalAction: string;
  selectorFailed: boolean;
  semanticCandidatesFound: number;
  contextAnchored: boolean;
  rankedCandidates: Array<{ ref: string; name: string; score: number }>;
  deterministicOutcome: 'single' | 'ambiguous' | 'none' | 'original_pass';
  aiInvoked: boolean;
  aiReason?: string;
  aiProposal?: string | null;
  aiValidated?: boolean;
  actionExecuted?: string;
  assertionPassed?: boolean;
  finalStatus: string;
  traceLog: string[];
}

export interface PipelineMetrics {
  totalTestRuns: number;
  originalSelectorFailures: number;
  deterministicRecoveryAttempts: number;
  deterministicRecoveries: number;
  aiFallbackInvocations: number;
  aiAssistedRecoveries: number;
  aiFallbackFailures: number;
  unresolvedAmbiguousCases: number;
  genuineApplicationFailures: number;
  finalAssertionPasses: number;
  finalAssertionFailures: number;
  totalRecoveryLatencyMs: number;
  actualLlmTokens: number;
}

export interface CalculatedAiSavings {
  deterministicRecoveryRate: number; // percentage
  aiInvocationRate: number;           // percentage
  estimatedAiCallsAvoided: number;
  estimatedTokensSaved: number;
  estimatedLatencySavedMs: number;
  estimatedCostSavedUsd: number;
  recoverySuccessRate: number;        // percentage
  assumptions: {
    baselineStrategy: string;
    avgTokensPerLlmCall: number;
    avgLatencyPerLlmCallMs: number;
    costPerCallUsd: number;
  };
}

class TelemetryCollector {
  private metrics: PipelineMetrics = {
    totalTestRuns: 0,
    originalSelectorFailures: 0,
    deterministicRecoveryAttempts: 0,
    deterministicRecoveries: 0,
    aiFallbackInvocations: 0,
    aiAssistedRecoveries: 0,
    aiFallbackFailures: 0,
    unresolvedAmbiguousCases: 0,
    genuineApplicationFailures: 0,
    finalAssertionPasses: 0,
    finalAssertionFailures: 0,
    totalRecoveryLatencyMs: 0,
    actualLlmTokens: 0,
  };

  private traces: StepTrace[] = [];

  recordRun(params: Partial<PipelineMetrics>) {
    this.metrics.totalTestRuns += params.totalTestRuns ?? 1;
    if (params.originalSelectorFailures) this.metrics.originalSelectorFailures += params.originalSelectorFailures;
    if (params.deterministicRecoveryAttempts) this.metrics.deterministicRecoveryAttempts += params.deterministicRecoveryAttempts;
    if (params.deterministicRecoveries) this.metrics.deterministicRecoveries += params.deterministicRecoveries;
    if (params.aiFallbackInvocations) this.metrics.aiFallbackInvocations += params.aiFallbackInvocations;
    if (params.aiAssistedRecoveries) this.metrics.aiAssistedRecoveries += params.aiAssistedRecoveries;
    if (params.aiFallbackFailures) this.metrics.aiFallbackFailures += params.aiFallbackFailures;
    if (params.unresolvedAmbiguousCases) this.metrics.unresolvedAmbiguousCases += params.unresolvedAmbiguousCases;
    if (params.genuineApplicationFailures) this.metrics.genuineApplicationFailures += params.genuineApplicationFailures;
    if (params.finalAssertionPasses) this.metrics.finalAssertionPasses += params.finalAssertionPasses;
    if (params.finalAssertionFailures) this.metrics.finalAssertionFailures += params.finalAssertionFailures;
    if (params.totalRecoveryLatencyMs) this.metrics.totalRecoveryLatencyMs += params.totalRecoveryLatencyMs;
    if (params.actualLlmTokens) this.metrics.actualLlmTokens += params.actualLlmTokens;
  }

  addTrace(trace: StepTrace) {
    this.traces.push(trace);
  }

  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  getTraces(): StepTrace[] {
    return [...this.traces];
  }

  clear() {
    this.metrics = {
      totalTestRuns: 0,
      originalSelectorFailures: 0,
      deterministicRecoveryAttempts: 0,
      deterministicRecoveries: 0,
      aiFallbackInvocations: 0,
      aiAssistedRecoveries: 0,
      aiFallbackFailures: 0,
      unresolvedAmbiguousCases: 0,
      genuineApplicationFailures: 0,
      finalAssertionPasses: 0,
      finalAssertionFailures: 0,
      totalRecoveryLatencyMs: 0,
      actualLlmTokens: 0,
    };
    this.traces = [];
  }

  calculateSavings(): CalculatedAiSavings {
    const {
      originalSelectorFailures,
      deterministicRecoveries,
      aiFallbackInvocations,
      aiAssistedRecoveries,
      deterministicRecoveryAttempts,
      genuineApplicationFailures,
      unresolvedAmbiguousCases,
    } = this.metrics;

    const detRate =
      originalSelectorFailures > 0
        ? Number(((deterministicRecoveries / originalSelectorFailures) * 100).toFixed(1))
        : 100.0;

    const aiRate =
      originalSelectorFailures > 0
        ? Number(((aiFallbackInvocations / originalSelectorFailures) * 100).toFixed(1))
        : 0.0;

    // Baseline: A naive AI-first system invokes an LLM for every original selector failure
    const callsAvoided = Math.max(0, originalSelectorFailures - aiFallbackInvocations);

    const avgTokens = 850;
    const avgLatencyMs = 1600;
    const costPerCall = 0.002;

    const tokensSaved = callsAvoided * avgTokens;
    const latencySavedMs = callsAvoided * avgLatencyMs;
    const costSavedUsd = Number((callsAvoided * costPerCall).toFixed(4));

    const totalRecoveryAttempts = deterministicRecoveryAttempts + aiFallbackInvocations;
    const totalSuccessfulRecoveries = deterministicRecoveries + aiAssistedRecoveries;

    const recoverySuccessRate =
      totalRecoveryAttempts > 0
        ? Number(((totalSuccessfulRecoveries / totalRecoveryAttempts) * 100).toFixed(1))
        : 100.0;

    return {
      deterministicRecoveryRate: detRate,
      aiInvocationRate: aiRate,
      estimatedAiCallsAvoided: callsAvoided,
      estimatedTokensSaved: tokensSaved,
      estimatedLatencySavedMs: latencySavedMs,
      estimatedCostSavedUsd: costSavedUsd,
      recoverySuccessRate,
      assumptions: {
        baselineStrategy: 'Naive LLM-first fallback (1 LLM call per eligible selector failure)',
        avgTokensPerLlmCall: avgTokens,
        avgLatencyPerLlmCallMs: avgLatencyMs,
        costPerCallUsd: costPerCall,
      },
    };
  }
}

export const telemetry = new TelemetryCollector();
