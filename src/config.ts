import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Automatically load .env file into process.env if present
function loadEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          const key = line.slice(0, eqIdx).trim();
          let val = line.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore env file read errors
    }
  }
}

loadEnv();

export const VIEWPORT = { width: 1280, height: 800 };
export const NAV_TIMEOUT_MS = 8000;      // page.goto / waitForURL
export const ACTION_TIMEOUT_MS = 5000;   // click/fill
export const HOME = process.env.HEALTEST_HOME ?? '.healtest';
export const LLM_MODE = (process.env.HEALTEST_LLM ?? 'off') as 'off'|'record'|'replay'|'live';
export const LLM_MODEL = process.env.HEALTEST_LLM_MODEL ?? 'gemini-2.5-flash';

export const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY ?? 'AIzaSyDummyKeyForKaizenAiTestingOnly999',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? 'kaizen-ai-demo.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID ?? 'kaizen-ai-demo',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? 'kaizen-ai-demo.appspot.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? '123456789012',
  appId: process.env.FIREBASE_APP_ID ?? '1:123456789012:web:abcdef1234567890',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID ?? 'G-ABCDEF1234',
};
