/**
 * `helpers/attendance.helper.js` dagi SANA yordamchilari (auth uchun
 * kerak bo'lgan qismi).
 *
 * ⚠ MAHALLIY KUN MUHIM: `enrolledAt`/`hiredAt` KALENDAR KUNI sifatida
 * saqlanadi (UTC-midnight). Oddiy `new Date()` ishlatilsa 00:00–05:00
 * oralig'ida KECHAGI kun yozilib qolardi (Asia/Tashkent = UTC+5).
 */

export const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN || 300);

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const shiftToLocal = (instant: Date | string | number): Date =>
  new Date(new Date(instant).getTime() + TZ_OFFSET_MIN * 60 * 1000);

export const toUtcMidnight = (date: Date | string | number): Date => {
  const d = new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
};

export const localTodayMidnight = (now: Date = new Date()): Date => {
  const s = shiftToLocal(now);
  return new Date(
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0),
  );
};

export const parseLocalDay = (input: unknown): Date | null => {
  if (typeof input === 'string' && DATE_KEY_RE.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    // Sana toshib ketishidan himoya (mas. 2026-02-31 → mart).
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }
  const instant = new Date(input as string);
  if (Number.isNaN(instant.getTime())) return null;
  return localTodayMidnight(instant);
};

/**
 * Berilgan sana MAHALLIY bugundan keyinmi.
 *
 * `enrolledAt` / `hiredAt` / `completedAt` tekshiruvlari shunga tayanadi:
 * kelajakdagi HR sanasi maosh va o'qish davri hisobini buzardi.
 */
export const isFutureLocalDay = (
  input: unknown,
  now: Date = new Date(),
): boolean => {
  const day = parseLocalDay(input);
  if (day == null) return false;
  return day.getTime() > localTodayMidnight(now).getTime();
};

/**
 * Sanani "YYYY-MM-DD" kalit satriga o'giradi (UTC bo'yicha).
 *
 * ⚠ UTC ATAYLAB: saqlanadigan `dateKey` maydonlari ham shu funksiya
 * orqali hosil qilinadi, ya'ni "bugun" ta'rifi (`localTodayMidnight`
 * UTC-midnight ko'rinishini beradi) bilan BIR XIL bo'lib qoladi.
 * Mahalliy `getDate()` ishlatilsa server vaqt zonasiga qarab kalit
 * siljib ketardi.
 */
export const dateKeyOf = (date: Date | string | number): string | null => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
