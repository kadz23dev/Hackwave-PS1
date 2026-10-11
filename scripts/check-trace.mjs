import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const P0_IDS = [
  'R-F1-01', 'R-F1-02', 'R-F1-03', 'R-F1-04', 'R-F1-05', 'R-F1-06',
  'R-F2-01', 'R-F2-02', 'R-F2-03', 'R-F2-04', 'R-F2-05',
  'R-F3-01', 'R-F3-02', 'R-F3-03', 'R-F3-04', 'R-F3-05', 'R-F3-06', 'R-F3-07',
  'R-F4-01', 'R-F4-02', 'R-F4-03', 'R-F4-04', 'R-F4-05', 'R-F4-06', 'R-F4-07',
  'R-F5-01', 'R-F5-02', 'R-F5-03', 'R-F5-04', 'R-F5-05', 'R-F5-06', 'R-F5-07', 'R-F5-08',
  'R-PIPE-01',
  'R-PS-01', 'R-PS-02', 'R-PS-03', 'R-PS-04', 'R-PS-05', 'R-PS-06', 'R-PS-07', 'R-PS-08', 'R-PS-09',
  'R-SC-A', 'R-SC-B', 'R-SC-C'
];

function getFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const out = [];
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      out.push(...getFiles(p));
    } else if (/\.(ts|mjs|js)$/.test(e)) {
      out.push(p);
    }
  }
  return out;
}

const allCode = [...getFiles('tests'), ...getFiles('oracles')].map(f => readFileSync(f, 'utf8')).join('\n');
const missing = P0_IDS.filter(id => !allCode.includes(`[${id}]`));

if (missing.length > 0) {
  console.error(`untested P0 requirements (${missing.length}): ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`trace ok: ${P0_IDS.length} P0 requirements tagged`);
