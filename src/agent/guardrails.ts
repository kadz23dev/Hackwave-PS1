/**
 * Security Guardrails for Kaizen AI Agents
 * Strictly sandboxes the AI Agent from:
 *  1. Application backend code (src/server, src/db, database files, server secrets)
 *  2. Environment files (.env, .env.*, credentials, API keys)
 *  3. Backend system administration commands and modifications
 */

const FORBIDDEN_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /(^|[/\\])\.env(\..+)?$/i,
  /(^|[/\\])src[/\\]server[/\\]/i,
  /(^|[/\\])src[/\\]db[/\\]/i,
  /(^|[/\\])dist[/\\]server[/\\]/i,
  /(^|[/\\])dist[/\\]db[/\\]/i,
  /\.sqlite(-.+)?$/i,
  /\.db(-.+)?$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials\.json/i,
  /service-account.*\.json/i,
  /server\.ts$/i,
  /api\.ts$/i,
  /repo\.ts$/i,
];

const FORBIDDEN_PROMPT_PATTERNS = [
  /\b(read|view|edit|modify|delete|expose|cat|dump|show)\s+(\.env|env\s*file|environment\s*variable|server\s*secret|api\s*key)/i,
  /\b(modify|change|hack|patch)\s+(the\s+)?(backend|server|api|database|sqlite|repo)/i,
  /\b(SELECT\s+.*FROM\s+settings|DROP\s+TABLE|ALTER\s+TABLE|DELETE\s+FROM)/i,
  /\b(SARVAM_API_KEY|FIREBASE_API_KEY|CSRF_SECRET)\b/i,
];

export interface GuardrailCheckResult {
  passed: boolean;
  backendProtected: boolean;
  envProtected: boolean;
  reason?: string;
  sanitizedPrompt?: string;
}

export interface GuardrailPatchValidation {
  allowed: boolean;
  targetScope: 'FRONTEND_COMPONENT' | 'PLAYWRIGHT_TEST' | 'FORBIDDEN_BACKEND' | 'FORBIDDEN_ENV';
  violation?: string;
}

/**
 * Checks whether a given file path is strictly protected by guardrails.
 */
export function isProtectedPath(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/').trim();
  return FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Evaluates a tester NLP prompt to ensure it does not attempt to breach backend or .env guardrails.
 */
export function inspectPromptGuardrails(prompt: string): GuardrailCheckResult {
  if (!prompt || typeof prompt !== 'string') {
    return {
      passed: true,
      backendProtected: true,
      envProtected: true,
    };
  }

  const trimmed = prompt.trim();

  for (const pattern of FORBIDDEN_PROMPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        passed: false,
        backendProtected: true,
        envProtected: true,
        reason: 'Security Guardrail Alert: Request references backend server operations or protected .env files. Kaizen AI agents are strictly isolated to Frontend and Playwright testing.',
      };
    }
  }

  // Also verify no direct file path attempts
  for (const filePattern of FORBIDDEN_FILE_PATTERNS) {
    if (filePattern.test(trimmed)) {
      return {
        passed: false,
        backendProtected: true,
        envProtected: true,
        reason: 'Security Guardrail Alert: Access to backend file or .env file is strictly forbidden.',
      };
    }
  }

  return {
    passed: true,
    backendProtected: true,
    envProtected: true,
  };
}

/**
 * Validates any code patch or remediation proposed by the agent.
 * Only frontend component patches and Playwright locators are allowed.
 */
export function validateRemediationGuardrails(
  targetFile?: string,
  patchCode?: string
): GuardrailPatchValidation {
  if (targetFile && isProtectedPath(targetFile)) {
    return {
      allowed: false,
      targetScope: targetFile.toLowerCase().includes('.env') ? 'FORBIDDEN_ENV' : 'FORBIDDEN_BACKEND',
      violation: `Blocked modification to protected path: ${targetFile}. AI agent cannot touch backend or environment files.`,
    };
  }

  if (patchCode) {
    // Check if patchCode contains attempts to write to .env or backend server
    for (const pattern of FORBIDDEN_PROMPT_PATTERNS) {
      if (pattern.test(patchCode)) {
        return {
          allowed: false,
          targetScope: 'FORBIDDEN_BACKEND',
          violation: 'Blocked patch containing forbidden backend or environment mutations.',
        };
      }
    }
  }

  return {
    allowed: true,
    targetScope: targetFile && targetFile.endsWith('.spec.ts') ? 'PLAYWRIGHT_TEST' : 'FRONTEND_COMPONENT',
  };
}
