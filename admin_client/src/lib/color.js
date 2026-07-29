// Brend rangi bilan ishlash — preview'da matn o'qilishi va fon tuslari uchun.

const FALLBACK = '#4f46e5';

/** "#abc" yoki "#aabbcc" ni "#aabbcc" ga keltiradi; noto'g'ri qiymatda fallback. */
export function normalizeHex(hex) {
  if (typeof hex !== 'string') return FALLBACK;
  const v = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return FALLBACK;
}

function toRgb(hex) {
  const v = normalizeHex(hex);
  return {
    r: parseInt(v.slice(1, 3), 16),
    g: parseInt(v.slice(3, 5), 16),
    b: parseInt(v.slice(5, 7), 16),
  };
}

/** WCAG nisbiy yorqinlik (0..1). */
function luminance(hex) {
  const { r, g, b } = toRgb(hex);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Shu rang ustidagi matn qora bo'lsinmi yoki oq — kontrast bo'yicha. */
export function readableOn(hex) {
  return luminance(hex) > 0.55 ? '#0f172a' : '#ffffff';
}

/** Shaffof tus — och fon/ramka uchun (masalan brend rangning 10% i). */
export function withAlpha(hex, alpha) {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
