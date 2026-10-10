export const VIEWPORT = { width: 1280, height: 800 };
export const NAV_TIMEOUT_MS = 8000;      // page.goto / waitForURL
export const ACTION_TIMEOUT_MS = 5000;   // click/fill
export const HOME = process.env.HEALTEST_HOME ?? '.healtest';
export const LLM_MODE = (process.env.HEALTEST_LLM ?? 'off') as 'off'|'record'|'replay'|'live';
export const LLM_MODEL = process.env.HEALTEST_LLM_MODEL ?? 'gemini-2.5-flash';
