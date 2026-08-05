/**
 * Brend rangini admin panel formatidan tenant client formatiga o'giradi.
 *
 * MUAMMO (shu modul tug'ilishining sababi): admin panel rangni HEX
 * ko'rinishida saqlaydi (`<input type="color">` boshqa formatni bilmaydi),
 * tenant client esa `.env` dan HSL KANALLARINI kutadi — "33 33% 35%",
 * `hsl()` o'ramisiz, chunki qiymat to'g'ridan-to'g'ri CSS o'zgaruvchisiga
 * (`--primary`) tushadi va Tailwind uni `hsl(var(--primary))` ichida ochadi.
 *
 * Ilgari provision.sh HEX qiymatni .env ga shundayligicha yozardi. Tenant
 * client'dagi `parseHsl("#4f46e5")` esa `null` qaytaradi va `applyAppTheme()`
 * jimgina chiqib ketadi — natijada brend rangi HECH QACHON qo'llanmagan,
 * hamma tenant standart temada ishlagan. Shuning uchun o'girish endi
 * .env yozilishidan oldin, shu yerda bajariladi.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** "#abc" yoki "#AABBCC" -> "#aabbcc"; yaroqsiz qiymatda null. */
export function normalizeHex(hex: string | null | undefined): string | null {
  if (typeof hex !== 'string') return null;
  const v = hex.trim();

  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/** HEX -> { h, s, l }; yaroqsiz qiymatda null. */
export function hexToHsl(hex: string | null | undefined): Hsl | null {
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

/** { h, s, l } -> "#aabbcc" (preview va tekshiruvlar uchun teskari yo'l). */
export function hslToHex({ h, s, l }: Hsl): string {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const hue = ((h % 360) + 360) % 360;

  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  const toByte = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toByte(f(0))}${toByte(f(8))}${toByte(f(4))}`;
}

/**
 * HEX -> tenant client `.env` kutadigan kanal qatori: "33 33% 35%".
 *
 * Yaroqsiz qiymatda null qaytaradi — chaqiruvchi o'zgaruvchini .env ga
 * umuman yozmasligi kerak. Bo'sh satr yozish eng yomon variant: client uni
 * "berilgan, lekin o'qib bo'lmaydi" deb qabul qiladi.
 */
export function hexToHslChannels(hex: string | null | undefined): string | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  return `${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%`;
}

/** "33 33% 35%" -> { h, s, l } (teskari o'qish, tekshiruvlar uchun). */
export function parseHslChannels(token: string | null | undefined): Hsl | null {
  if (typeof token !== 'string') return null;
  const parts = token.trim().replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;

  const [h, s, l] = parts.map((p) => parseFloat(p));
  if ([h, s, l].some((n) => Number.isNaN(n))) return null;

  return { h: ((h % 360) + 360) % 360, s: clamp(s, 0, 100), l: clamp(l, 0, 100) };
}

// ─────────────────────────────────────────── kontrast (WCAG 2.1)

function relativeLuminance({ h, s, l }: Hsl): number {
  const hex = hslToHex({ h, s, l });
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16))
  );
}

/** Ikki rang orasidagi kontrast nisbati (1:1 … 21:1). */
export function contrastRatio(a: Hsl, b: Hsl): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Brend rangi fon ustida o'qiladimi.
 *
 * Tenant client kontrast yetmasa rangni O'ZI to'g'irlaydi (yorug'likni
 * suradi), shuning uchun bu tekshiruv bloklamaydi — admin panelda
 * "kiritgan rangingiz saytda biroz o'zgaradi" deb ogohlantirish uchun.
 */
export function isReadable(brand: Hsl, surface: Hsl, minRatio = 4.5): boolean {
  return contrastRatio(brand, surface) >= minRatio;
}
