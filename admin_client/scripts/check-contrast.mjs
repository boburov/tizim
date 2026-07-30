/**
 * Rang kontrastini tekshiradi (WCAG 2.1 AA).
 *
 *   npm run check:contrast
 *
 * `src/index.css` dagi `:root` (light) va `.dark` tokenlarini o'qib,
 * matn/fon juftliklarini tekshiradi. Talab: matn uchun 4.5:1,
 * fokus halqasi kabi UI elementlari uchun 3:1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─────────────────────────────────────────────── rang hisob-kitobi

const parseHsl = (token) => {
  if (typeof token !== 'string') return null;
  const parts = token.trim().replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;

  const [h, s, l] = parts.map((p) => parseFloat(p));
  return [h, s, l].some(Number.isNaN) ? null : { h, s, l };
};

const hslToRgb = ({ h, s, l }) => {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

const luminance = (hsl) => {
  const toLinear = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hslToRgb(hsl).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// ─────────────────────────────────────────────── tokenlarni o'qish

const readTokens = (css, selector) => {
  const start = css.indexOf(selector);
  if (start === -1) return {};

  const open = css.indexOf('{', start);
  const end = css.indexOf('}', open);
  const body = css.slice(open + 1, end);

  const tokens = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
};

// ─────────────────────────────────────────────── juftliklar

const PAIRS = [
  ['foreground', 'background', 4.5, 'asosiy matn'],
  ['card-foreground', 'card', 4.5, 'karta matni'],
  ['popover-foreground', 'popover', 4.5, 'popover matni'],
  ['primary-foreground', 'primary', 4.5, 'asosiy tugma'],
  ['secondary-foreground', 'secondary', 4.5, 'ikkilamchi tugma'],
  ['accent-foreground', 'accent', 4.5, 'accent / hover qatori'],
  ['muted-foreground', 'background', 4.5, 'ikkinchi darajali matn (fon)'],
  ['muted-foreground', 'card', 4.5, 'ikkinchi darajali matn (karta)'],
  ['muted-foreground', 'muted', 4.5, 'ikkinchi darajali matn (muted)'],
  ['destructive-foreground', 'destructive', 4.5, 'xavfli tugma'],
  ['success-foreground', 'success', 4.5, 'muvaffaqiyat tugmasi'],
  ['warning-foreground', 'warning', 4.5, 'ogohlantirish tugmasi'],
  ['info-foreground', 'info', 4.5, "ma'lumot tugmasi"],
  ['foreground', 'muted', 4.5, 'matn muted ustida'],
  ['foreground', 'accent', 4.5, 'matn accent ustida'],
  ['foreground', 'secondary', 4.5, 'matn secondary ustida'],
  ['destructive', 'background', 4.5, 'xato matni (fon)'],
  ['destructive', 'card', 4.5, 'xato matni (karta)'],
  ['success', 'card', 4.5, 'muvaffaqiyat matni (karta)'],
  ['warning', 'card', 4.5, 'ogohlantirish matni (karta)'],
  ['info', 'card', 4.5, "ma'lumot matni (karta)"],
  ['primary', 'background', 4.5, 'havola / brend matni (fon)'],
  ['primary', 'card', 4.5, 'havola / brend matni (karta)'],
  ['ring', 'background', 3, 'fokus halqasi'],
];

let failures = 0;
let checks = 0;

const check = (title, tokens) => {
  console.log(`\n### ${title}`);

  for (const [fg, bg, min, label] of PAIRS) {
    const a = parseHsl(tokens[fg]);
    const b = parseHsl(tokens[bg]);
    if (!a || !b) continue;

    const ratio = contrastRatio(a, b);
    const ok = ratio >= min;
    checks += 1;
    if (!ok) failures += 1;

    console.log(
      `${ok ? '  ok  ' : '  XATO'} ${ratio.toFixed(2).padStart(6)}:1 ` +
        `(kerak ${min})  ${label}  [--${fg} / --${bg}]`,
    );
  }
};

const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

check('index.css - light', readTokens(css, ':root'));
check('index.css - dark', readTokens(css, '.dark'));

console.log(
  `\n${failures === 0 ? '✓ HAMMASI JOYIDA' : `✗ ${failures} ta muammo`} - ${checks} ta tekshiruv\n`,
);

process.exit(failures === 0 ? 0 : 1);
