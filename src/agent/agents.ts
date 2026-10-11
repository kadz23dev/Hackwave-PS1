/**
 * Specialized AI Agents for Playwright Error Detection, UI Root-Cause Analysis,
 * Self-Healing Selector Synthesis, and Quality Triage.
 */

import type {
  PlaywrightErrorContext,
  AgentMessage,
  AgentRole
} from './types.js';

export const AGENT_PROFILES: Record<
  AgentRole,
  { name: string; badge: string; avatar: string; roleDescription: string }
> = {
  sentinel: {
    name: 'Sentinel (Playwright Monitor)',
    badge: 'PW MONITOR',
    avatar: '🚨',
    roleDescription: 'Detects real-time Playwright execution errors, locator timeouts, strict-mode violations, and unhandled DOM exceptions.'
  },
  inspector: {
    name: 'Inspector (DOM & Drift)',
    badge: 'DOM ANALYST',
    avatar: '🔍',
    roleDescription: 'Inspects DOM mutations, semantic text changes, CSS repositioning, and classifies UI Drift vs App Bugs.'
  },
  architect: {
    name: 'Architect (Self-Healing)',
    badge: 'SELECTOR SYNTH',
    avatar: '🛠️',
    roleDescription: 'Synthesizes resilient replacement locators (getByRole, data-testid, aria) and generates Playwright test patches.'
  },
  triage: {
    name: 'Triage (QA Lead)',
    badge: 'ORACLE VERIFIED',
    avatar: '⚖️',
    roleDescription: 'Verifies deterministic backend oracles, declares test verdicts (HEALED_PASS vs APP_BUG), and documents changes.'
  }
};

export function formatAgentMessage(
  role: AgentRole,
  text: string,
  extra?: Partial<AgentMessage>
): AgentMessage {
  const profile = AGENT_PROFILES[role];
  const now = new Date();
  const time = now.toTimeString().split(' ')[0];

  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender: role,
    senderName: profile.name,
    badge: profile.badge,
    avatar: profile.avatar,
    time,
    text,
    ...extra
  };
}

export function buildDiagnosticPrompt(ctx: PlaywrightErrorContext): { system: string; user: string } {
  const system = `You are an elite Multi-Agent Playwright Engineering team composed of:
1. Sentinel (@sentinel): Playwright Runtime Error Detective
2. Inspector (@inspector): UI & DOM Visual Drift Analyst
3. Architect (@architect): Self-Healing Selector Synthesizer
4. Triage (@triage): Quality Assurance & Oracle Verification Lead

SECURITY GUARDRAIL CONSTRAINTS:
You are strictly a frontend UI and Playwright automation assistant. You are forbidden from inspecting, modifying, generating code for, or referencing the application backend (src/server, src/db, database files) or any environment files (.env, credentials, secrets). All suggested remedies MUST be strictly confined to frontend components and Playwright test scripts.

CHANGE SEVERITY & REMEDIATION RULES:
1. SMALL COMPONENT ERRORS (Small changes like changing button name, CSS class, color, position, margin, padding):
   - Provide "changeSeverity": "SMALL_COMPONENT_DRIFT"
   - Provide "componentFix" containing the exact corrected HTML, CSS, and Playwright locator for that component so it can be fixed immediately.
2. MAJOR UI CHANGES (Big changes like changing overall page design, navbar overhaul, multi-step flow restructuring):
   - Provide "changeSeverity": "MAJOR_UI_REDESIGN"
   - Provide "developerAdvisory" containing a clear, detailed message and action checklist for the frontend developer explaining the structural changes required.
3. APPLICATION BACKEND BUG:
   - Provide "changeSeverity": "APP_BUG" with no healing.

Analyze the provided Playwright test failure in modern web software. Return a strictly structured JSON object detailing the multi-agent debate and remediation plan.`;

  const user = `PLAYWRIGHT TEST FAILURE EVENT:
- Test: ${ctx.testName}
- Step: ${ctx.stepIndex} of ${ctx.totalSteps} (${ctx.stepAction} on ${ctx.targetSelector})
- Target URL: ${ctx.targetUrl}
- Error Type: ${ctx.errorType}
- Raw Playwright Error: ${ctx.errorMessage}
- DOM Context / Nearby Text: ${ctx.nearText || ctx.domSnippet || 'Button #add-to-cart replaced in redesigned shop-v2 markup'}
${ctx.consoleErrors?.length ? `- Console Errors: ${ctx.consoleErrors.join('; ')}` : ''}
${ctx.networkErrors?.length ? `- Network Errors: ${ctx.networkErrors.map(n => `${n.method} ${n.url} (${n.status})`).join('; ')}` : ''}

CRITICAL CLASSIFICATION INSTRUCTIONS:
- If Error Type is APP_500_ERROR or HTTP 500 occurred, classification MUST be "APP_BUG" and changeSeverity MUST be "APP_BUG". Do NOT heal.
- If Error Type is STRICT_MODE_VIOLATION or multiple elements match, classification MUST be "AMBIGUOUS".
- If locator timed out or changed due to small button/text/color redesign, classification MUST be "HARMLESS_UI" and changeSeverity MUST be "SMALL_COMPONENT_DRIFT".
- If the entire navbar or layout was redesigned, changeSeverity MUST be "MAJOR_UI_REDESIGN".

Respond with valid JSON matching this schema:
{
  "diagnosis": "Detailed root-cause diagnosis...",
  "classification": "HARMLESS_UI" | "BREAKING_UI" | "APP_BUG" | "AMBIGUOUS",
  "changeSeverity": "SMALL_COMPONENT_DRIFT" | "MAJOR_UI_REDESIGN" | "APP_BUG" | "NONE",
  "confidence": 92,
  "conversation": [
    {
      "role": "sentinel",
      "text": "Alert: page.locator('#add-to-cart').click() timed out after 5000ms. Element absent in current DOM."
    },
    {
      "role": "inspector",
      "text": "DOM inspection shows the component was redesigned: id changed, label updated to 'Add to bag'. Coordinates shifted 263px."
    },
    {
      "role": "architect",
      "text": "Synthesized 3 resilient replacement selectors with priority on getByRole and data-testid."
    },
    {
      "role": "triage",
      "text": "Validated against backend order creation oracle. Test execution passed. Generated audit note."
    }
  ],
  "candidates": [
    {
      "selector": "button[data-testid='add-to-bag']",
      "strategy": "data-testid",
      "confidence": 94,
      "stable": true,
      "rationale": "Resilient test attribute unaffected by styling changes."
    },
    {
      "selector": "role=button[name='Add to bag']",
      "strategy": "role-and-name",
      "confidence": 91,
      "stable": true,
      "rationale": "High accessibility rating and resilient against DOM nesting changes."
    },
    {
      "selector": "#add-to-bag",
      "strategy": "css-structural",
      "confidence": 85,
      "stable": true,
      "rationale": "Direct replacement element discovered on v2 redesign."
    }
  ],
  "componentFix": {
    "componentName": "AddToCartButton",
    "changeDescription": "Button label modernized from 'Add to Cart' to 'Add to Bag' with data-testid='add-to-bag'",
    "correctedHtml": "<button type='button' class='btn btn-primary add-to-bag' data-testid='add-to-bag'>Add to bag</button>",
    "correctedCss": ".add-to-bag { padding: 10px 20px; font-weight: 600; border-radius: 6px; }",
    "correctedPlaywrightLocator": "page.getByRole('button', { name: 'Add to bag' })",
    "patchCode": "await page.getByRole('button', { name: 'Add to bag' }).click();"
  },
  "developerAdvisory": {
    "title": "Frontend Layout Redesign Advisory",
    "summary": "Major navigation and cart layout structure altered in v2 release.",
    "affectedAreas": ["Navbar component", "Checkout modal layout"],
    "requiredFrontendChanges": [
      "Update header navigation routes to match new catalog hierarchy",
      "Synchronize responsive cart drawer state with new layout grid"
    ],
    "suggestedAction": "Notify frontend UI team to review breaking layout updates."
  },
  "healing": {
    "oldSelector": "${ctx.targetSelector}",
    "newSelector": "#add-to-bag",
    "score": "0.92",
    "provenance": "text-similarity & role-button",
    "oracle": "order-created ✓ | POST /api/orders 200 ✓"
  },
  "note": {
    "title": "Playwright Locator Drift on ${ctx.testName}",
    "tag": "Drift",
    "body": "Detailed notes on what changed and how the multi-agent team resolved the failure..."
  }
}
`;

  return { system, user };
}

export function buildClarificationPrompt(
  testerPrompt: string,
  targetUrl: string = 'http://127.0.0.1:4102/cart.html'
): { system: string; user: string } {
  const system = `You are Kaizen AI's Test Clarification & Playwright Orchestrator.
A tester has provided a natural language testing prompt. Your job is to:
1. Clarify what to do (test intent & step breakdown)
2. Clarify how to do it (exact Playwright code and locators)
3. Detail expected feedback and assertion checks that Playwright should monitor.

SECURITY GUARDRAIL CONSTRAINTS:
You are strictly confined to Frontend UI actions and Playwright tests. You CANNOT interact with backend server code, database files, or .env secrets.

Respond strictly in valid JSON matching this schema:
{
  "summary": "Clear summary of testing objectives",
  "playwrightInstructions": [
    {
      "stepNumber": 1,
      "action": "navigate",
      "target": "${targetUrl}",
      "whatToDo": "Navigate to the store page",
      "howToDo": "await page.goto(targetUrl);",
      "code": "await page.goto('${targetUrl}');",
      "expectedAssertion": "Page title and store header visible"
    },
    {
      "stepNumber": 2,
      "action": "click",
      "target": "button[data-testid='add-to-bag']",
      "whatToDo": "Add product to bag",
      "howToDo": "await page.getByRole('button', { name: /add to bag|add to cart/i }).click();",
      "code": "await page.getByRole('button', { name: /add to bag|add to cart/i }).click();",
      "expectedAssertion": "Subtotal updates to $19.99 and bag counter shows 1"
    }
  ]
}`;

  const user = `TESTER NLP PROMPT:
"${testerPrompt}"

TARGET APPLICATION URL:
${targetUrl}

Generate the step-by-step Playwright testing instructions and clarification.`;

  return { system, user };
}

