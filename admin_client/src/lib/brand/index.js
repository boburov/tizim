/**
 * Brend preview'ining "miyasi".
 *
 * Admin panel rangni HEX bilan ishlaydi (`<input type="color">`), tenant
 * client esa HSL kanallari bilan. Bu modul ikkalasini bog'laydi va
 * tenant saytdagi AYNAN o'sha token dvigateli orqali (`./brandTokens.js`)
 * to'liq light/dark token to'plamini hosil qiladi.
 *
 * Natijada preview "taxminiy rasm" emas: unda ko'ringan har bir yuza,
 * matn va chegara rangi haqiqiy saytdagi qiymat bilan bir xil.
 */
import { buildDarkTokens, buildLightTokens } from './brandTokens.js';
import { contrastRatio, formatHsl, parseHsl } from './color.js';

// ─────────────────────────────────────────────────── HEX ↔ HSL

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** "#abc" / "#AABBCC" -> "#aabbcc"; yaroqsizda null. */
export function normalizeHex(hex) {
  if (typeof hex !== 'string') return null;
  const v = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/** HEX -> { h, s, l }; yaroqsizda null. */
export function hexToHsl(hex) {
  const v = normalizeHex(hex);
  if (!v) return null;

  const r = parseInt(v.slice(1, 3), 16) / 255;
  const g = parseInt(v.slice(3, 5), 16) / 255;
  const b = parseInt(v.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

/** { h, s, l } -> "#aabbcc". */
export function hslToHex({ h, s, l }) {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const hue = ((h % 360) + 360) % 360;

  const k = (n) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  const byte = (v) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${byte(f(0))}${byte(f(8))}${byte(f(4))}`;
}

/** HEX -> tenant `.env` kutadigan kanal qatori ("217 91% 60%"). */
export function hexToChannels(hex) {
  const hsl = hexToHsl(hex);
  return hsl ? formatHsl(hsl) : null;
}

// ─────────────────────────────────── tenant client bazaviy tokenlari
//
// Bular tenant client'dagi `src/styles/index.css` dan olingan standart
// qiymatlar. Brend faqat BIR QISM tokenni almashtiradi (`--primary`,
// yuzalar, chegaralar) — qolganlari (status ranglari, radius, grafik
// ranglari) shu bazadan keladi. Bazani ham qo'shmasak, preview'da
// xato/muvaffaqiyat ranglari yo'q bo'lib qolardi.

const BASE_LIGHT = {
  '--background': '36 50% 98%',
  '--foreground': '24 20% 12%',
  '--card': '0 0% 100%',
  '--card-foreground': '24 20% 12%',
  '--popover': '0 0% 100%',
  '--popover-foreground': '24 20% 12%',
  '--primary': '33 33% 35%',
  '--primary-foreground': '36 50% 98%',
  '--secondary': '30 12% 94%',
  '--secondary-foreground': '24 20% 18%',
  '--muted': '30 14% 95%',
  '--muted-foreground': '28 8% 42%',
  '--accent': '30 20% 93%',
  '--accent-foreground': '24 20% 18%',
  '--destructive': '0 72% 42%',
  '--destructive-foreground': '0 0% 100%',
  '--success': '142 62% 29%',
  '--success-foreground': '0 0% 100%',
  '--warning': '32 90% 34%',
  '--warning-foreground': '0 0% 100%',
  '--info': '212 78% 40%',
  '--info-foreground': '0 0% 100%',
  '--border': '30 12% 88%',
  '--input': '30 12% 85%',
  '--ring': '33 33% 35%',
  '--sidebar-background': '0 0% 100%',
  '--sidebar-foreground': '24 15% 28%',
  '--sidebar-primary': '33 33% 35%',
  '--sidebar-primary-foreground': '36 50% 98%',
  '--sidebar-accent': '30 20% 93%',
  '--sidebar-accent-foreground': '24 20% 18%',
  '--sidebar-border': '30 12% 88%',
};

const BASE_DARK = {
  '--background': '30 9% 8%',
  '--foreground': '36 22% 94%',
  '--card': '30 8% 11%',
  '--card-foreground': '36 22% 94%',
  '--popover': '30 8% 11%',
  '--popover-foreground': '36 22% 94%',
  '--primary': '33 42% 66%',
  '--primary-foreground': '30 30% 10%',
  '--secondary': '30 6% 17%',
  '--secondary-foreground': '36 20% 92%',
  '--muted': '30 6% 16%',
  '--muted-foreground': '32 12% 68%',
  '--accent': '30 8% 20%',
  '--accent-foreground': '36 20% 92%',
  '--destructive': '0 72% 67%',
  '--destructive-foreground': '0 30% 8%',
  '--success': '142 50% 55%',
  '--success-foreground': '142 40% 8%',
  '--warning': '36 78% 58%',
  '--warning-foreground': '36 50% 8%',
  '--info': '212 68% 62%',
  '--info-foreground': '212 50% 8%',
  '--border': '30 6% 22%',
  '--input': '30 6% 26%',
  '--ring': '33 42% 66%',
  '--sidebar-background': '30 8% 10%',
  '--sidebar-foreground': '36 16% 82%',
  '--sidebar-primary': '33 42% 66%',
  '--sidebar-primary-foreground': '30 30% 10%',
  '--sidebar-accent': '30 8% 20%',
  '--sidebar-accent-foreground': '36 20% 92%',
  '--sidebar-border': '30 6% 22%',
};

/**
 * Brend HEX qiymatlaridan to'liq light va dark token to'plamini quradi.
 *
 * @param {{primary?:string, background?:string, primaryDark?:string, backgroundDark?:string}} brand
 * @returns {{ light: Record<string,string>, dark: Record<string,string> }}
 */
export function buildPreviewTheme(brand = {}) {
  const parsed = {
    primary: hexToHsl(brand.primary),
    background: hexToHsl(brand.background),
    primaryDark: hexToHsl(brand.primaryDark),
    backgroundDark: hexToHsl(brand.backgroundDark),
  };

  return {
    light: { ...BASE_LIGHT, ...buildLightTokens(parsed) },
    dark: { ...BASE_DARK, ...buildDarkTokens(parsed) },
  };
}

/** Token to'plamini React `style` obyektiga aylantiradi. */
export function tokenStyle(tokens) {
  return Object.fromEntries(Object.entries(tokens));
}

/** Token qiymatini brauzer tushunadigan rangga o'giradi. */
export const cssColor = (token) => `hsl(${token})`;

/** Token qiymatidan HEX (rang namunasi va nusxalash uchun). */
export function tokenToHex(token) {
  const hsl = parseHsl(token);
  return hsl ? hslToHex(hsl) : '#000000';
}

// ────────────────────────────────────────────── ogohlantirishlar

/**
 * Brend tanlovidagi muammolarni topadi.
 *
 * MUHIM: bularning HECH BIRI xato emas — tenant client kontrast yetmasa
 * rangni o'zi to'g'irlaydi. Shuning uchun matnlar "sayt buziladi" emas,
 * "saytda rangingiz biroz o'zgaradi" deb tushuntiradi. Aks holda
 * foydalanuvchi to'g'ri ishlayotgan narsani "xato" deb tuzatishga urinadi.
 */
export function analyzeBrand(brand = {}) {
  const warnings = [];
  const theme = buildPreviewTheme(brand);

  const primaryHsl = hexToHsl(brand.primary);
  if (!primaryHsl) return { warnings, theme };

  // 1) Light rejimda brend rangi o'zgarganmi (kontrast uchun suriladimi)
  const appliedLight = parseHsl(theme.light['--primary']);
  if (appliedLight && Math.abs(appliedLight.l - primaryHsl.l) >= 3) {
    warnings.push({
      level: 'info',
      title: "Light rejimda rang biroz o'zgaradi",
      text:
        `Kiritilgan rang och fon ustida o'qilishi uchun yorug'ligi ` +
        `${Math.round(primaryHsl.l)}% dan ${Math.round(appliedLight.l)}% ga suriladi. ` +
        'Tus (ottenka) saqlanadi.',
    });
  }

  // 2) Qora/oq brend rangi — dark rejimda alohida e'tibor talab qiladi
  const isAchromatic = primaryHsl.s < 8;
  const isExtreme = primaryHsl.l <= 6 || primaryHsl.l >= 94;
  if (isAchromatic && isExtreme && !brand.primaryDark) {
    warnings.push({
      level: 'warn',
      title: "Dark rejim uchun alohida rang kiriting",
      text:
        "Qora (yoki oq) brend rangini qorong'i fonda ko'rsatib bo'lmaydi — " +
        'tizim uni kulrangga aylantiradi. Brend ko\'rinishini saqlash uchun ' +
        '"Dark rejim brend rangi" maydonini to\'ldiring.',
    });
  }

  // 3) Dark rejimdagi yakuniy kontrast
  const darkPrimary = parseHsl(theme.dark['--primary']);
  const darkBg = parseHsl(theme.dark['--background']);
  if (darkPrimary && darkBg) {
    const ratio = contrastRatio(darkPrimary, darkBg);
    if (ratio < 4.5) {
      warnings.push({
        level: 'warn',
        title: "Dark rejimda kontrast past",
        text: `Brend rangi qorong'i fon ustida ${ratio.toFixed(1)}:1 — talab 4.5:1.`,
      });
    }
  }

  // 4) Juda och fon — kartochkalar fondan ajralmay qoladi
  const bgHsl = hexToHsl(brand.background);
  if (bgHsl && bgHsl.l >= 99.5) {
    warnings.push({
      level: 'info',
      title: 'Fon deyarli sof oq',
      text:
        "Kartochkalar ham oq bo'lgani uchun ular fondan ajralmaydi. " +
        "Fonni bir oz to'qroq qilsangiz interfeys tiniqroq ko'rinadi.",
    });
  }

  return { warnings, theme };
}
