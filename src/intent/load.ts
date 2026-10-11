import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { IntentSchema, type Intent } from '../types.js';

/**
 * Recursively deep-freeze an object or array.
 * Any mutation attempt will throw TypeError in strict mode.
 */
export function deepFreeze<T>(o: T): Readonly<T> {
  if (o === null || typeof o !== 'object') return o as Readonly<T>;
  Object.freeze(o);
  if (Array.isArray(o)) {
    for (const item of o) deepFreeze(item);
  } else {
    for (const key of Object.keys(o)) {
      deepFreeze((o as Record<string, unknown>)[key]);
    }
  }
  return o as Readonly<T>;
}

/**
 * Walk all string values inside the `expected` array and replace
 * `{{data.<key>}}` with the corresponding value from intent.data.
 * Throws if any referenced key is not present in data.
 */
function resolveTemplates(
  expected: Intent['expected'],
  data: Record<string, string>,
): Intent['expected'] {
  const re = /\{\{data\.(\w+)\}\}/g;

  function walkValue(val: unknown): unknown {
    if (typeof val === 'string') {
      return val.replace(re, (_match, key: string) => {
        if (!(key in data)) {
          throw new Error(`unknown template key data.${key}`);
        }
        return String(data[key]);
      });
    }
    if (Array.isArray(val)) return val.map(walkValue);
    if (val !== null && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = walkValue(v);
      }
      return out;
    }
    return val;
  }

  return walkValue(expected) as Intent['expected'];
}

/**
 * Parse, validate, template-resolve, and deep-freeze an intent YAML string.
 *
 * @param raw  YAML string of the intent file.
 * @returns `{ intent, sha256, raw }` — intent is immutable.
 */
export function parseIntent(raw: string): {
  intent: Readonly<Intent>;
  sha256: string;
  raw: string;
} {
  const sha256 = createHash('sha256').update(Buffer.from(raw, 'utf8')).digest('hex');

  // Parse YAML then validate with zod (throws on unknown keys or wrong types)
  const obj = YAML.parse(raw) as unknown;
  const parsed = IntentSchema.parse(obj);

  // Resolve {{data.X}} templates inside `expected`
  const resolved: Intent = {
    ...parsed,
    expected: resolveTemplates(parsed.expected, parsed.data),
  };

  return { intent: deepFreeze(resolved), sha256, raw };
}

/**
 * Load, validate, template-resolve, and deep-freeze an intent YAML file.
 *
 * @param path  Absolute or relative path to the `.intent.yaml` file.
 * @returns `{ intent, sha256, raw }` — intent is immutable.
 */
export function loadIntent(path: string): {
  intent: Readonly<Intent>;
  sha256: string;
  raw: string;
} {
  const raw = readFileSync(path, 'utf8');
  return parseIntent(raw);
}

