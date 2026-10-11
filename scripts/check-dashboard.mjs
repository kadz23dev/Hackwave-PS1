import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

if (!existsSync('dashboard/tokens.css')) {
  console.log('no dashboard yet');
  process.exit(0);
}

const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (h) => {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const css = readFileSync('dashboard/tokens.css', 'utf8');
const [lightSrc, darkSrc = ''] = css.split('/* @dark */');
const tok = (src) =>
  Object.fromEntries(
    [...src.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]])
  );
const modes = { light: tok(lightSrc), dark: tok(darkSrc) };

const PAIRS = [
  ['ink', 'paper', 7],
  ['ink', 'card', 7],
  ['ink-2', 'paper', 4.5],
  ['crimson', 'paper', 4.5],
  ['on-fill', 'crimson-fill', 4.5],
  ['crimson-deep', 'crimson-wash', 4.5],
  ['ink', 'crimson-wash', 7],
  ['jade', 'jade-wash', 4.5],
  ['amber', 'gold-wash', 4.5],
  ['slate', 'slate-wash', 4.5],
  ['line-strong', 'paper', 3],
  ['focus', 'paper', 3],
];

const errors = [];
for (const [mode, t] of Object.entries(modes)) {
  for (const [fg, bg, min] of PAIRS) {
    if (!t[fg] || !t[bg]) {
      errors.push(`${mode}: missing token ${!t[fg] ? fg : bg}`);
      continue;
    }
    const r = ratio(t[fg], t[bg]);
    if (r < min) errors.push(`${mode}: ${fg} on ${bg} = ${r.toFixed(2)} < ${min}`);
  }
}

const files = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

const dashDir = existsSync('dashboard') ? 'dashboard' : (existsSync('src/dashboard') ? 'src/dashboard' : null);
if (dashDir) {
  for (const f of files(dashDir)) {
    if (f.endsWith('tokens.css')) continue;
    const t = readFileSync(f, 'utf8');
    const colorLiteral = f.endsWith('.css')
      ? /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
      : /(color|background|border|fill|stroke)[^;"'\n]*:\s*(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/i;
    if (colorLiteral.test(t)) errors.push(`${f}: literal colour (use var(--token))`);
    if (/https?:\/\/(?!localhost|127\.0\.0\.1)/.test(t)) errors.push(`${f}: external URL (no CDN/fonts)`);
  }
}

if (errors.length) {
  console.log(errors.slice(0, 12).join('\n'));
  process.exit(1);
}
console.log('dashboard palette ok');
