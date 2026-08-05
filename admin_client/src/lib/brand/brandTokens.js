// MIRROR: bu fayl — tenant client'idagi client/src/shared/lib/theme/brandTokens.js ning AYNAN nusxasi.
// MIRROR: preview haqiqiy saytdan farq qilmasligi uchun tokenlar bir xil
// MIRROR: dvigatel bilan hisoblanadi. Qo'lda tahrirlamang — asl faylni
// MIRROR: o'zgartiring va `npm run check:brand-sync` bilan tekshiring.
/**
 * Brend rangidan (.env) to'liq light/dark token to'plamini hosil qiladi.
 *
 * Bu modul SOF (pure) - `import.meta.env`, `document` yoki boshqa brauzer
 * API'lariga tegmaydi. Shuning uchun uni Node ostida ham ishga tushirib,
 * kontrastni tekshirsa bo'ladi (`npm run check:contrast`).
 *
 * .env da 4 ta o'zgaruvchi bor:
 *   VITE_APP_PRIMARY         - light rejim brend rangi   (majburiy emas)
 *   VITE_APP_BACKGROUND      - light rejim foni          (majburiy emas)
 *   VITE_APP_PRIMARY_DARK    - dark rejim brend rangi    (berilmasa hosil qilinadi)
 *   VITE_APP_BACKGROUND_DARK - dark rejim foni           (berilmasa hosil qilinadi)
 *
 * Dark qiymatlar berilmasa, light qiymatlardan avtomatik hosil qilinadi:
 * tus (hue) saqlanadi, yorug'lik (lightness) kontrast yetguncha oshiriladi.
 */
// Nisbiy yo'l (alias emas) - shunda bu modulni Node ostida ham ishga
// tushirib, kontrastni tekshirsa bo'ladi (`npm run check:contrast`).
import { formatHsl, readableOn, ensureContrast } from "./color.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Bazadan `delta` foizga yorqinroq yuza (surface) hosil qiladi. */
const lift = (base, delta, saturation) => ({
  h: base.h,
  s: saturation,
  l: clamp(base.l + delta, 0, 100),
});

/** Fon to'q bo'lsa yorug'likni oshiramiz, och bo'lsa kamaytiramiz. */
const directionFor = (surface) => (surface.l < 50 ? "up" : "down");

/**
 * Matn/chegara tusi yuzaning to'yinganligiga ERGASHADI.
 *
 * Buni qat'iy son qilib qo'yish xato: neytral (kulrang, `s: 0`) fon
 * berilganda matn ham neytral bo'lishi kerak, aks holda oq matn
 * pushti/sariqqa moyil bo'lib chiqadi.
 */
const tintOf = (surface, max) => Math.min(max, surface.s * 2);

/**
 * Yuza ustida o'qiladigan ASOSIY matn rangi.
 * Avval och/to'q orasidan mosini tanlaydi, keyin kontrastni kafolatlaydi.
 */
const textOn = (surface, hue, minRatio = 7) => {
  const tint = tintOf(surface, 22);
  const light = { h: hue, s: tint, l: 96 };
  const dark = { h: hue, s: Math.min(30, tint + 8), l: 10 };
  const picked = readableOn(surface, light, dark);
  return ensureContrast(
    picked,
    surface,
    minRatio,
    picked === light ? "up" : "down",
  );
};

/**
 * Brend rangini berilgan yuza ustida o'qiladigan holga keltiradi va
 * ustidagi matn rangini tanlaydi.
 */
const brandOn = (brand, surface, hue, minRatio) => {
  const safe = ensureContrast(brand, surface, minRatio, directionFor(surface));

  // Brend rangi ustidagi matn ham tekshiriladi. Buni tashlab ketib
  // bo'lmaydi: masalan brend O'RTA KULRANG bo'lib qolsa (qora rang dark
  // rejimda shunday bo'ladi), na oq, na qora o'zi 4.5:1 bermaydi -
  // shuning uchun tanlagandan keyin yana chegaraga suriladi.
  const light = { h: hue, s: 20, l: 97 };
  const dark = { h: hue, s: 30, l: 9 };
  const picked = readableOn(safe, light, dark);
  const onBrand = ensureContrast(
    picked,
    safe,
    minRatio,
    picked === light ? "up" : "down",
  );

  return { safe, onBrand };
};

/**
 * LIGHT rejim tokenlari.
 * Neytral yuzalar fon rangining tusidan (hue) oladi - shunda butun
 * interfeys bitta rang oilasida ko'rinadi.
 */
export const buildLightTokens = ({ primary, background } = {}) => {
  const tokens = {};

  if (background) {
    const hue = background.h;
    const tint = Math.min(background.s, 20);

    tokens["--background"] = formatHsl(background);
    tokens["--foreground"] = formatHsl({ h: hue, s: 20, l: 12 });
    tokens["--secondary"] = formatHsl({ h: hue, s: tint * 0.6, l: 94 });
    tokens["--secondary-foreground"] = formatHsl({ h: hue, s: 20, l: 18 });
    tokens["--muted"] = formatHsl({ h: hue, s: tint * 0.7, l: 95 });
    tokens["--muted-foreground"] = formatHsl({ h: hue, s: 8, l: 42 });
    tokens["--accent"] = formatHsl({ h: hue, s: tint, l: 93 });
    tokens["--accent-foreground"] = formatHsl({ h: hue, s: 20, l: 18 });
    tokens["--border"] = formatHsl({ h: hue, s: tint * 0.6, l: 88 });
    tokens["--input"] = formatHsl({ h: hue, s: tint * 0.6, l: 85 });
    tokens["--sidebar-accent"] = formatHsl({ h: hue, s: tint, l: 93 });
    tokens["--sidebar-accent-foreground"] = formatHsl({ h: hue, s: 20, l: 18 });
    tokens["--sidebar-border"] = formatHsl({ h: hue, s: tint * 0.6, l: 88 });
  }

  if (primary) {
    // Brend rangi och fon ustida kamida 4.5:1 bo'lishi shart - aks holda
    // havolalar va "outline" tugma yozuvlari o'qilmaydi.
    const surface = background || { h: primary.h, s: 0, l: 100 };
    const { safe, onBrand } = brandOn(primary, surface, surface.h, 4.5);

    tokens["--primary"] = formatHsl(safe);
    tokens["--primary-foreground"] = formatHsl(onBrand);
    tokens["--ring"] = formatHsl(safe);
    tokens["--sidebar-primary"] = formatHsl(safe);
    tokens["--sidebar-primary-foreground"] = formatHsl(onBrand);
  }

  return tokens;
};

/**
 * DARK rejim tokenlari.
 *
 * - `backgroundDark` berilgan bo'lsa - AYNAN o'sha fon ishlatiladi, qolgan
 *   yuzalar (card, muted, accent, border) shu fondan pog'onalab hosil
 *   qilinadi. Berilmasa, light fon tusidan to'q variant yasaladi.
 * - `primaryDark` berilgan bo'lsa - AYNAN o'sha brend rangi ishlatiladi.
 *   Faqat kontrast tekshiriladi: agar fon ustida 4.5:1 dan past bo'lsa,
 *   o'qilishi uchun yorug'ligi ko'tariladi (tus o'zgarmaydi).
 */
export const buildDarkTokens = ({
  primary,
  background,
  primaryDark,
  backgroundDark,
} = {}) => {
  const tokens = {};

  const hue = backgroundDark?.h ?? background?.h ?? primary?.h ?? 30;

  // Fon: aniq berilgan bo'lsa o'shani olamiz, aks holda to'q variant yasaymiz.
  const darkBg = backgroundDark ?? { h: hue, s: 9, l: 8 };

  // Yuza pog'onalari fon yorug'ligiga NISBATAN hisoblanadi - shunda
  // maxsus fon (masalan `0 0% 4%`) berilganda ham ohang buzilmaydi.
  const tint = clamp(darkBg.s, 0, 12);
  const surfaceSat = Math.min(tint, 8);

  const card = lift(darkBg, 3, surfaceSat);
  const muted = lift(darkBg, 8, Math.min(tint, 6));
  const secondary = lift(darkBg, 9, Math.min(tint, 6));
  const accent = lift(darkBg, 12, surfaceSat);
  const border = lift(darkBg, 14, Math.min(tint, 6));
  const input = lift(darkBg, 18, Math.min(tint, 6));
  const sidebarBg = lift(darkBg, 2, surfaceSat);

  const fg = textOn(darkBg, hue);

  tokens["--background"] = formatHsl(darkBg);
  tokens["--foreground"] = formatHsl(fg);
  tokens["--card"] = formatHsl(card);
  tokens["--card-foreground"] = formatHsl(textOn(card, hue));
  tokens["--popover"] = formatHsl(card);
  tokens["--popover-foreground"] = formatHsl(textOn(card, hue));
  tokens["--secondary"] = formatHsl(secondary);
  tokens["--secondary-foreground"] = formatHsl(textOn(secondary, hue));
  tokens["--muted"] = formatHsl(muted);
  tokens["--accent"] = formatHsl(accent);
  tokens["--accent-foreground"] = formatHsl(textOn(accent, hue));
  tokens["--border"] = formatHsl(border);
  tokens["--input"] = formatHsl(input);

  // Ikkinchi darajali matn: ataylab xiraroq, lekin ENG YORUG' yuza
  // (muted) ustida ham 4.5:1 dan tushmasligi kerak.
  tokens["--muted-foreground"] = formatHsl(
    ensureContrast(
      { h: hue, s: tintOf(muted, 12), l: 68 },
      muted,
      4.5,
      directionFor(muted),
    ),
  );

  tokens["--sidebar-background"] = formatHsl(sidebarBg);
  tokens["--sidebar-foreground"] = formatHsl(
    ensureContrast(
      { h: hue, s: tintOf(sidebarBg, 16), l: 82 },
      sidebarBg,
      4.5,
      directionFor(sidebarBg),
    ),
  );
  tokens["--sidebar-accent"] = formatHsl(accent);
  tokens["--sidebar-accent-foreground"] = formatHsl(textOn(accent, hue));
  tokens["--sidebar-border"] = formatHsl(border);

  // Brend rangi: aniq berilgan dark qiymat bo'lsa o'shani, bo'lmasa
  // light qiymatdan hosil qilamiz.
  const brandSource = primaryDark ?? primary;

  if (brandSource) {
    // Qo'lda kiritilgan rangga TEGMAYMIZ - faqat kontrasti tekshiriladi.
    //
    // Avtomatik hosil qilinayotganda esa kontrastning eng past chegarasiga
    // (4.5:1) yopishib qolish yaramaydi: natija to'q va xira chiqadi.
    // Shuning uchun yorug'likka "qulay" quyi chegara qo'yamiz - qorong'i
    // temada brend ranglari odatda 60-70% yorug'likda bo'ladi.
    const base = primaryDark
      ? { ...primaryDark }
      : {
          h: brandSource.h,
          // Axromatik rangni (qora/oq/kulrang) ATAYLAB shundayligicha
          // qoldiramiz - aks holda `s` ni ko'tarib, qora rangga yo'qdan
          // qizil tus qo'shib qo'ygan bo'lardik.
          s: brandSource.s < 8 ? brandSource.s : clamp(brandSource.s, 25, 55),
          l: Math.max(brandSource.l, 62),
        };

    const { safe, onBrand } = brandOn(base, darkBg, hue, 4.5);

    tokens["--primary"] = formatHsl(safe);
    tokens["--primary-foreground"] = formatHsl(onBrand);
    tokens["--ring"] = formatHsl(safe);
    tokens["--sidebar-primary"] = formatHsl(safe);
    tokens["--sidebar-primary-foreground"] = formatHsl(onBrand);
  }

  return tokens;
};
