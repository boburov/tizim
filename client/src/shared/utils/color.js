/**
 * HSL token yordamchilari.
 *
 * Tokenlar CSS'da `--primary: 33 33% 35%` ko'rinishida saqlanadi (hsl()
 * o'ramisiz), shuning uchun bu yerdagi funksiyalar ham shu formatda
 * ishlaydi. Asosiy vazifasi - brend rangidan dark rejim variantini
 * KONTRASTNI KAFOLATLAGAN holda hosil qilish.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** "33 33% 35%" -> { h: 33, s: 33, l: 35 } */
export const parseHsl = (token) => {
  if (typeof token !== "string") return null;
  const parts = token.trim().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;

  const [h, s, l] = parts.map((part) => parseFloat(part));
  if ([h, s, l].some((n) => Number.isNaN(n))) return null;

  return { h: ((h % 360) + 360) % 360, s: clamp(s, 0, 100), l: clamp(l, 0, 100) };
};

/**
 * Tokenni tekshiradi va DIAPAZONDAN CHIQQAN qiymatlarni aytib beradi.
 *
 * NEGA KERAK: `parseHsl` noto'g'ri qiymatni jimgina chegaraga suradi.
 * Masalan `"4 2% 115%"` -> `l: 100` bo'lib SOF OQ rang chiqadi. Tokenlar
 * o'zaro kontrastli bo'lgani uchun `check:contrast` ham buni "joyida" deb
 * biladi - xato faqat ekranda ko'rinadi. Shuning uchun clamp qilishdan
 * OLDIN qiymatni alohida tekshiramiz.
 *
 * Sof funksiya - Node (`check:contrast`) va brauzerda birdek ishlaydi.
 *
 * @returns {{ ok: boolean, issues: string[], value: {h,s,l}|null }}
 */
export const validateHsl = (token, label = "rang") => {
  if (token === undefined || token === null || token === "") {
    return { ok: true, issues: [], value: null };
  }

  const value = parseHsl(token);
  if (!value) {
    return {
      ok: false,
      value: null,
      issues: [
        `${label}: "${token}" o'qib bo'lmadi. Kutilgan format: "<tus> <to'yinganlik>% <yorug'lik>%" (masalan "33 33% 35%").`,
      ],
    };
  }

  const parts = String(token).trim().replace(/,/g, " ").split(/\s+/);
  const [, rawS, rawL] = parts.map((part) => parseFloat(part));
  const issues = [];

  if (rawS < 0 || rawS > 100) {
    issues.push(
      `${label}: to'yinganlik (saturation) ${rawS}% - 0..100 oralig'idan tashqarida, ${value.s}% ga surildi.`,
    );
  }
  if (rawL < 0 || rawL > 100) {
    issues.push(
      `${label}: yorug'lik (lightness) ${rawL}% - 0..100 oralig'idan tashqarida, ${value.l}% ga surildi.` +
        (value.l === 100 ? " Natijada rang SOF OQ bo'lib qoladi." : "") +
        (value.l === 0 ? " Natijada rang SOF QORA bo'lib qoladi." : ""),
    );
  }

  return { ok: issues.length === 0, issues, value };
};

/** { h, s, l } -> "33 33% 35%" */
export const formatHsl = ({ h, s, l }) =>
  `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;

/** HSL -> [r, g, b], har biri 0..1 oralig'ida */
const hslToRgb = ({ h, s, l }) => {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

/** WCAG nisbiy yorug'lik (relative luminance) */
export const luminance = (hsl) => {
  const toLinear = (v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const [r, g, b] = hslToRgb(hsl).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Ikki rang orasidagi WCAG kontrast nisbati (1..21) */
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Berilgan fon uchun matn rangini tanlaydi - qaysi biri kuchliroq
 * kontrast bersa, o'sha qaytariladi.
 */
export const readableOn = (bg, light, dark) =>
  contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;

/**
 * Rangning yorug'ligini (lightness) shunday sozlaydiki, u `bg` ustida
 * kamida `minRatio` kontrast bersin. Rang tusi (hue) o'zgarmaydi -
 * shuning uchun brend "o'zi bo'lib" qoladi.
 *
 * @param {{h,s,l}} color    - boshlang'ich rang
 * @param {{h,s,l}} bg       - qaysi fon ustida ko'rinishi kerak
 * @param {number}  minRatio - kerakli minimal kontrast
 * @param {"up"|"down"} direction - yorug'likni oshirish yoki kamaytirish
 */
export const ensureContrast = (color, bg, minRatio, direction = "up") => {
  const step = direction === "up" ? 1 : -1;
  let candidate = { ...color };

  for (let i = 0; i < 100; i += 1) {
    if (contrastRatio(candidate, bg) >= minRatio) return candidate;

    const nextL = candidate.l + step;
    if (nextL < 0 || nextL > 100) break;
    candidate = { ...candidate, l: nextL };
  }

  // Chegaraga yetib ham yetmasa - eng kuchli variantni qaytaramiz.
  return { ...color, l: direction === "up" ? 100 : 0 };
};
