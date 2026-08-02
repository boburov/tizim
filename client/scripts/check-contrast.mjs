/**
 * Rang kontrastini tekshiradi (WCAG 2.1 AA).
 *
 *   npm run check:contrast
 *
 * Nimani tekshiradi:
 *   1. `src/styles/index.css` dagi `:root` (light) va `.dark` tokenlari.
 *   2. `.env` dagi brend ranglaridan HOSIL QILINGAN tokenlar - ya'ni
 *      VITE_APP_PRIMARY / VITE_APP_BACKGROUND o'zgarganda ham interfeys
 *      o'qilishligicha qoladimi.
 *
 * Talab: matn uchun 4.5:1, UI elementlari (fokus halqasi) uchun 3:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseHsl, contrastRatio, validateHsl } from "../src/shared/utils/color.js";
import {
  buildLightTokens,
  buildDarkTokens,
} from "../src/shared/lib/theme/brandTokens.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────── tokenlarni o'qish

/** CSS matnidan `selector { --token: H S% L%; }` juftliklarini yig'adi. */
const readTokens = (css, selector) => {
  const start = css.indexOf(selector);
  if (start === -1) return {};

  const open = css.indexOf("{", start);
  const end = css.indexOf("}", open);
  const body = css.slice(open + 1, end);

  const tokens = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
};

/**
 * `buildLightTokens`/`buildDarkTokens` kalitlarni `--primary` ko'rinishida
 * qaytaradi, `readTokens` esa prefiksni olib tashlaydi (`primary`).
 * Birlashtirishdan OLDIN ikkisini bir xil ko'rinishga keltiramiz - aks
 * holda spread ustidan yozmaydi va tekshiruv statik qiymatlarni
 * "tekshirgan" bo'lib qolaveradi.
 */
const normalize = (tokens) =>
  Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [key.replace(/^--/, ""), value]),
  );

/** .env faylidan bitta kalitni oladi. */
const readEnv = (file, key) => {
  if (!fs.existsSync(file)) return undefined;
  const line = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith(`${key}=`));
  return line?.slice(line.indexOf("=") + 1).trim() || undefined;
};

// ─────────────────────────────────────────────── tekshiriladigan juftliklar

// [matn, fon, minimal nisbat, izoh]
const PAIRS = [
  ["foreground", "background", 4.5, "asosiy matn"],
  ["card-foreground", "card", 4.5, "karta matni"],
  ["popover-foreground", "popover", 4.5, "popover matni"],
  ["primary-foreground", "primary", 4.5, "asosiy tugma"],
  ["secondary-foreground", "secondary", 4.5, "ikkilamchi tugma"],
  ["accent-foreground", "accent", 4.5, "accent / hover qatori"],
  ["muted-foreground", "background", 4.5, "ikkinchi darajali matn (fon)"],
  ["muted-foreground", "card", 4.5, "ikkinchi darajali matn (karta)"],
  ["muted-foreground", "muted", 4.5, "ikkinchi darajali matn (muted)"],
  ["destructive-foreground", "destructive", 4.5, "xavfli tugma"],
  ["success-foreground", "success", 4.5, "muvaffaqiyat tugmasi"],
  ["warning-foreground", "warning", 4.5, "ogohlantirish tugmasi"],
  ["info-foreground", "info", 4.5, "ma'lumot tugmasi"],
  ["foreground", "muted", 4.5, "matn muted ustida"],
  ["foreground", "accent", 4.5, "matn accent ustida"],
  ["foreground", "secondary", 4.5, "matn secondary ustida"],
  ["destructive", "background", 4.5, "xato matni (fon)"],
  ["destructive", "card", 4.5, "xato matni (karta)"],
  ["success", "card", 4.5, "muvaffaqiyat matni (karta)"],
  ["warning", "card", 4.5, "ogohlantirish matni (karta)"],
  ["info", "card", 4.5, "ma'lumot matni (karta)"],
  ["primary", "background", 4.5, "havola / brend matni (fon)"],
  ["primary", "card", 4.5, "havola / brend matni (karta)"],
  ["ring", "background", 3, "fokus halqasi"],
  ["sidebar-foreground", "sidebar-background", 4.5, "sidebar matni"],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5, "sidebar faol element"],
  ["sidebar-primary-foreground", "sidebar-primary", 4.5, "sidebar brend"],
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
      `${ok ? "  ok  " : "  XATO"} ${ratio.toFixed(2).padStart(6)}:1 ` +
        `(kerak ${min})  ${label}  [--${fg} / --${bg}]`,
    );
  }
};

// ─────────────────────────────────────────────── ishga tushirish

const css = fs.readFileSync(path.join(ROOT, "src/styles/index.css"), "utf8");
const light = readTokens(css, ":root");
const dark = readTokens(css, ".dark");

check("index.css - light", light);
check("index.css - dark", dark);

// .env brend ranglari qo'llangandagi holat
const envFile = path.join(ROOT, ".env");

/**
 * Kontrastdan OLDIN qiymatning o'zi to'g'rimi - shuni tekshiramiz.
 *
 * Buni tashlab ketib bo'lmaydi: `parseHsl` diapazondan chiqqan qiymatni
 * jimgina chegaraga suradi. "4 2% 115%" -> yorug'lik 100% -> brend rangi
 * SOF OQ. Hosil bo'lgan tokenlar o'zaro kontrastli bo'lgani uchun
 * quyidagi tekshiruvlar hammasi "ok" beradi - xato faqat ekranda
 * ko'rinadi. Shuning uchun alohida to'siq kerak.
 */
const ENV_COLOR_KEYS = [
  "VITE_APP_PRIMARY",
  "VITE_APP_BACKGROUND",
  "VITE_APP_PRIMARY_DARK",
  "VITE_APP_BACKGROUND_DARK",
];

console.log("\n### .env rang qiymatlari");
let envIssues = 0;
for (const key of ENV_COLOR_KEYS) {
  const raw = readEnv(envFile, key);
  const { ok, issues } = validateHsl(raw, key);
  if (raw === undefined) continue;

  checks += 1;
  if (ok) {
    console.log(`  ok    ${key} = ${raw}`);
  } else {
    envIssues += issues.length;
    failures += 1;
    for (const issue of issues) console.log(`  XATO  ${issue}`);
  }
}
if (envIssues === 0) console.log("  (diapazon xatolari topilmadi)");

const brand = {
  primary: parseHsl(readEnv(envFile, "VITE_APP_PRIMARY")),
  background: parseHsl(readEnv(envFile, "VITE_APP_BACKGROUND")),
  primaryDark: parseHsl(readEnv(envFile, "VITE_APP_PRIMARY_DARK")),
  backgroundDark: parseHsl(readEnv(envFile, "VITE_APP_BACKGROUND_DARK")),
};

if (Object.values(brand).some(Boolean)) {
  check(".env brend - light", { ...light, ...normalize(buildLightTokens(brand)) });
  check(".env brend - dark", { ...dark, ...normalize(buildDarkTokens(brand)) });
} else {
  console.log("\n(.env da brend ranglari yo'q - faqat CSS tokenlari tekshirildi)");
}

// Chetdagi holatlar: brend rangi qora / juda to'q berilganda ham tizim
// o'qiladigan bo'lib qolishi kerak. Bu yerda AYNAN shuni tekshiramiz.
const EDGE_CASES = [
  ["qora brend (avtomatik dark)", { primary: parseHsl("0 0% 0%"), background: parseHsl("36 50% 98%") }],
  [
    "qora brend + qo'lda dark rang",
    {
      primary: parseHsl("0 0% 0%"),
      background: parseHsl("36 50% 98%"),
      primaryDark: parseHsl("36 45% 70%"),
      backgroundDark: parseHsl("0 0% 4%"),
    },
  ],
];

for (const [name, input] of EDGE_CASES) {
  check(`chet holat: ${name} - light`, {
    ...light,
    ...normalize(buildLightTokens(input)),
  });
  check(`chet holat: ${name} - dark`, {
    ...dark,
    ...normalize(buildDarkTokens(input)),
  });
}

console.log(
  `\n${failures === 0 ? "✓ HAMMASI JOYIDA" : `✗ ${failures} ta muammo`} ` +
    `- ${checks} ta tekshiruv\n`,
);

process.exit(failures === 0 ? 0 : 1);
