/**
 * Deterministic oracle runner — PRD §8.1, §10.5
 */

import type { Page } from 'playwright';
import type { Intent, NetworkEvent, OracleResult } from '../types.js';

export async function runOracles(
  intent: Intent,
  targetOrigin: string,
  network: NetworkEvent[],
  page: Page
): Promise<OracleResult[]> {
  const results: OracleResult[] = [];

  for (const o of intent.expected) {
    try {
      if (o.type === 'backend_state') {
        const url = `${targetOrigin}${o.request.path}`;
        const res = await fetch(url, { method: o.request.method });
        if (!res.ok) {
          results.push({
            oracleId: o.id,
            type: o.type,
            ok: false,
            supportingOnly: false,
            detail: { httpStatus: res.status },
          });
          continue;
        }

        const json = (await res.json()) as Record<string, unknown>;
        const arr = json[o.select];
        if (!Array.isArray(arr)) {
          results.push({
            oracleId: o.id,
            type: o.type,
            ok: false,
            supportingOnly: false,
            detail: { error: `Expected array at ${o.select}` },
          });
          continue;
        }

        const filtered = arr.filter((item: Record<string, unknown>) =>
          Object.entries(o.where).every(([k, v]) => String(item[k]) === String(v))
        );

        const mismatches: Array<{ field: string; expected: string; actual: unknown }> = [];
        if (o.expect.fields) {
          for (const item of filtered) {
            for (const [f, v] of Object.entries(o.expect.fields)) {
              if (String(item[f]) !== String(v)) {
                mismatches.push({ field: f, expected: String(v), actual: item[f] });
              }
            }
          }
        }

        const countOk = o.expect.count === undefined || filtered.length === o.expect.count;
        const ok = countOk && mismatches.length === 0 && filtered.length > 0;

        results.push({
          oracleId: o.id,
          type: o.type,
          ok,
          supportingOnly: false,
          detail: {
            expectedCount: o.expect.count,
            actualCount: filtered.length,
            mismatches,
          },
        });
      } else if (o.type === 'network_status') {
        const urlRegex = new RegExp(o.urlPattern);
        const matched = network.filter(
          n => urlRegex.test(n.path) && (!o.method || n.method === o.method)
        );

        let ok = true;
        if (o.forbidStatusAtLeast != null) {
          ok = ok && matched.every(n => n.status < o.forbidStatusAtLeast!);
        }
        if (o.requireStatusIn && o.requireStatusIn.length > 0) {
          ok = ok && matched.length > 0 && matched.every(n => o.requireStatusIn!.includes(n.status));
        }

        results.push({
          oracleId: o.id,
          type: o.type,
          ok,
          supportingOnly: false,
          detail: {
            matched: matched.map(({ method, path, status }) => ({ method, path, status })),
          },
        });
      } else if (o.type === 'dom_state') {
        const bodyText = (await page.innerText('body')).toLowerCase();
        const ok = o.textAny.some(t => bodyText.includes(t.toLowerCase()));
        results.push({
          oracleId: o.id,
          type: o.type,
          ok,
          supportingOnly: o.supportingOnly ?? true,
          detail: { matched: ok },
        });
      }
    } catch (e) {
      results.push({
        oracleId: o.id,
        type: o.type,
        ok: false,
        supportingOnly: o.type === 'dom_state' ? (o.supportingOnly ?? true) : false,
        detail: { error: String(e) },
      });
    }
  }

  return results;
}

export function allRequiredPass(rs: OracleResult[]): boolean {
  const req = rs.filter(r => !r.supportingOnly);
  return req.length > 0 && req.every(r => r.ok);
}
