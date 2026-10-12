/**
 * Multi-Agent Playwright Error Detection & Communication System Types
 */

export type PlaywrightErrorType =
  | 'TIMEOUT'
  | 'LOCATOR_NOT_FOUND'
  | 'ELEMENT_NOT_INTERACTABLE'
  | 'STRICT_MODE_VIOLATION'
  | 'APP_500_ERROR'
  | 'ORACLE_ASSERTION_FAILED'
  | 'NAVIGATION_ERROR';

export type AgentRole = 'sentinel' | 'inspector' | 'architect' | 'triage';

export interface PlaywrightErrorContext {
  testName: string;
  stepIndex: number;
  totalSteps: number;
  stepAction: 'click' | 'fill' | 'check' | 'navigate' | 'assert';
  targetSelector: string;
  targetUrl: string;
  errorMessage: string;
  errorType: PlaywrightErrorType;
  domSnippet?: string;
  nearText?: string;
  consoleErrors?: string[];
  networkErrors?: Array<{ url: string; status: number; method: string }>;
}

export interface CandidateSelector {
  selector: string;
  strategy: 'data-testid' | 'role-and-name' | 'text-content' | 'css-structural';
  confidence: number;
  stable: boolean;
  rationale: string;
}

export interface AgentMessage {
  id: string;
  sender: AgentRole | 'user';
  senderName: string;
  badge: string;
  avatar: string;
  time: string;
  text: string;
  healing?: {
    oldSelector: string;
    newSelector: string;
    score: string;
    provenance: string;
    oracle: string;
  };
  details?: {
    diagnosis?: string;
    classification?: 'HARMLESS_UI' | 'BREAKING_UI' | 'APP_BUG' | 'AMBIGUOUS';
    confidence?: number;
    oldSelector?: string;
    newSelector?: string;
    candidates?: CandidateSelector[];
    oracleCheck?: { invariant: string; passed: boolean; endpoint?: string; status?: number };
    patchCode?: string;
    noteTitle?: string;
    noteBody?: string;
  };
}

export interface PlaywrightExecutionLog {
  time: string;
  level: 'info' | 'warn' | 'heal' | 'pass' | 'fail';
  msg: string;
}

export interface PlaywrightStepInstruction {
  stepNumber: number;
  action: 'navigate' | 'click' | 'fill' | 'check' | 'assert';
  target: string;
  whatToDo: string;
  howToDo: string;
  code: string;
  expectedAssertion: string;
}

export interface TesterPromptClarification {
  intent: string;
  summary: string;
  playwrightInstructions: PlaywrightStepInstruction[];
  guardrailCheck: {
    passed: boolean;
    backendProtected: boolean;
    envProtected: boolean;
    reason?: string;
  };
}

export type ChangeSeverity = 'SMALL_COMPONENT_DRIFT' | 'MAJOR_UI_REDESIGN' | 'APP_BUG' | 'NONE';

export interface ComponentFix {
  componentName: string;
  changeDescription: string;
  correctedHtml: string;
  correctedCss: string;
  correctedPlaywrightLocator: string;
  patchCode: string;
}

export interface DeveloperAdvisory {
  title: string;
  summary: string;
  affectedAreas: string[];
  requiredFrontendChanges: string[];
  suggestedAction: string;
}

export interface MultiAgentDiagnosticResult {
  ok: boolean;
  verdict: 'PASS' | 'HEALED_PASS' | 'APP_BUG' | 'NEEDS_REVIEW' | 'FAIL_UNREPAIRABLE';
  activeStep: number;
  totalSteps: number;
  testName: string;
  targetUrl: string;
  conversation: AgentMessage[];
  changeSeverity?: ChangeSeverity;
  componentFix?: ComponentFix;
  developerAdvisory?: DeveloperAdvisory;
  clarification?: TesterPromptClarification;
  guardrailsActive?: boolean;
  healing?: {
    oldSelector: string;
    newSelector: string;
    score: string;
    provenance: string;
    oracle: string;
  };
  logs: PlaywrightExecutionLog[];
  candidates?: CandidateSelector[];
  noteCreated?: {
    id?: number;
    title: string;
    tag: string;
    body: string;
  };
  searchOutputs?: {
    query: string;
    resultsUrl: string;
    status: string;
    count?: string;
    items: Array<{ title: string; desc: string }>;
  } | null;
}

