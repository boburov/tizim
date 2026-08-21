import { normalizePhone } from '../../common/utils/phone.js';
import { parseLocalDay } from '../../common/utils/date.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMUMIY MAYDON TEKSHIRUVCHILARI (`imports/services/coerce.service.js`).
 *
 * ⚠ Har biri `{ ok, value, error }` qaytaradi — `throw` QILMAYDI. Sabab:
 * bitta qatordagi xato BUTUN importni to'xtatmasligi kerak, aksincha
 * qator bo'yicha yig'ilib foydalanuvchiga ro'yxat bo'lib ko'rsatiladi.
 *
 * ⚠ MAVJUD HELPERLAR QAYTA ISHLATILADI (`normalizePhone`, `parseLocalDay`):
 * import orqali kelgan ma'lumot UI orqali kelgani bilan AYNAN BIR XIL
 * qoidalardan o'tishi shart. Alohida parser yozilsa import "YON ESHIK"
 * bo'lib qolardi — masalan UI rad etadigan sanani import qabul qilardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface CoerceResult<T = any> {
  ok: boolean;
  value: T | null;
  error: string | null;
}

const err = (message: string): CoerceResult => ({ ok: false, value: null, error: message });
const good = <T>(value: T): CoerceResult<T> => ({ ok: true, value, error: null });

export const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export const asText = (raw: unknown, { max = 500 }: { max?: number } = {}): CoerceResult<string> => {
  if (isBlank(raw)) return good('');
  const text = String(raw).trim();
  if (text.length > max) return err(`Matn juda uzun (${max} belgidan oshmasin)`);
  return good(text);
};

const checkRange = (
  num: number, { min, max, integer }: { min?: number; max?: number; integer?: boolean },
): CoerceResult<number> => {
  if (integer && !Number.isInteger(num)) return err("Butun son bo'lishi kerak");
  if (min !== undefined && num < min) return err(`${min} dan kichik bo'lmasin`);
  if (max !== undefined && num > max) return err(`${max} dan katta bo'lmasin`);
  return good(num);
};

/**
 * Sonlarni Excel'dan kelgan TURLI ko'rinishda qabul qiladi:
 * `1200000` | `"1 200 000"` | `"1,200,000"` | `"1200000.50"` | `"1 200 000 so'm"`
 */
export const asNumber = (
  raw: unknown,
  { min, max, integer = false }: { min?: number; max?: number; integer?: boolean } = {},
): CoerceResult<number> => {
  if (isBlank(raw)) return err("Bo'sh");
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return err("Son noto'g'ri");
    return checkRange(raw, { min, max, integer });
  }

  // ⚠ Vergul O'NLIK ajratgich ham bo'lishi mumkin ("1200,50") — faqat
  // undan keyin 1-2 raqam bo'lsa o'nlik deb olinadi.
  let text = String(raw).replace(/[\s ]/g, '');
  text = text.replace(/so'm|som|sum|uzs/gi, '');
  if (/^-?[\d.]+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
  else text = text.replace(/,/g, '');

  if (text === '' || !/^-?\d*\.?\d+$/.test(text)) return err('Son emas');
  const num = Number(text);
  if (!Number.isFinite(num)) return err("Son noto'g'ri");
  return checkRange(num, { min, max, integer });
};

export const asMoney = (
  raw: unknown, { min = 0, max }: { min?: number; max?: number } = {},
): CoerceResult<number> => {
  const res = asNumber(raw, { min, max });
  if (!res.ok) return res;
  // ⚠ TIYIN YO'Q — so'm butun son. 0.5 so'm kiritilsa yaxlitlash JIMGINA
  // pul yo'qotardi, shuning uchun aniq xato beramiz.
  if (!Number.isInteger(res.value as number)) {
    return err("Butun son bo'lishi kerak (tiyin yo'q)");
  }
  return res;
};

/** Sana: Excel `Date` katagi, `2025-06-15`, `15.06.2025`, `15/06/2025`. */
export const asDate = (
  raw: unknown, { future = false }: { future?: boolean } = {},
): CoerceResult<Date> => {
  if (isBlank(raw)) return err("Bo'sh");

  let input: unknown = raw;
  if (!(raw instanceof Date)) {
    const text = String(raw).trim();
    // `dd.mm.yyyy` / `dd/mm/yyyy` → `yyyy-mm-dd` (`parseLocalDay` ISO kutadi).
    const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
    if (m) {
      const [, d, mo, y] = m;
      input = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    } else {
      input = text;
    }
  }

  const day = parseLocalDay(input);
  if (!day) return err("Sana noto'g'ri (kutilgan format: 2025-06-15 yoki 15.06.2025)");
  if (!future) {
    const today = parseLocalDay(new Date())!;
    if (day.getTime() > today.getTime()) {
      return err("Sana kelajakda bo'lishi mumkin emas");
    }
  }
  return good(day);
};

export const asPhone = (raw: unknown): CoerceResult<string> => {
  if (isBlank(raw)) return err("Bo'sh");
  const phone = normalizePhone(raw as string);
  if (!phone) return err("Telefon raqam noto'g'ri (masalan 998901234567)");
  return good(phone);
};

export const asYear = (raw: unknown) =>
  asNumber(raw, { min: 2000, max: 3000, integer: true });

const MONTH_NAMES = [
  ['yanvar', 'january', 'январь', '1-oy'],
  ['fevral', 'february', 'февраль', '2-oy'],
  ['mart', 'march', 'март', '3-oy'],
  ['aprel', 'april', 'апрель', '4-oy'],
  ['may', 'мая', 'май', '5-oy'],
  ['iyun', 'june', 'июнь', '6-oy'],
  ['iyul', 'july', 'июль', '7-oy'],
  ['avgust', 'august', 'август', '8-oy'],
  ['sentabr', 'september', 'сентябрь', '9-oy'],
  ['oktabr', 'october', 'октябрь', '10-oy'],
  ['noyabr', 'november', 'ноябрь', '11-oy'],
  ['dekabr', 'december', 'декабрь', '12-oy'],
];

export const asMonth = (raw: unknown): CoerceResult<number> => {
  const res = asNumber(raw, { min: 1, max: 12, integer: true });
  if (!res.ok && String(raw ?? '').trim() !== '') {
    // ⚠ "iyun" kabi OY NOMI ham qabul qilinsin — foydalanuvchi Excel'da
    // oyni matn qilib yozishi JUDA KENG tarqalgan.
    const idx = MONTH_NAMES.findIndex((names) =>
      names.includes(String(raw).trim().toLowerCase()),
    );
    if (idx >= 0) return good(idx + 1);
  }
  return res;
};

/**
 * Ro'yxatdan tanlov.
 *
 * ⚠ YORLIQ (o'zbekcha) ham, KOD (inglizcha) ham qabul qilinadi —
 * foydalanuvchi eksportdan ko'chirib qo'yishi mumkin.
 */
export const asEnum = (
  raw: unknown,
  labelToValue: Record<string, string>,
  { fallback }: { fallback?: string } = {},
): CoerceResult<string> => {
  if (isBlank(raw)) {
    if (fallback !== undefined) return good(fallback);
    return err("Bo'sh");
  }
  const key = String(raw).trim().toLowerCase().replace(/['’ʻ`]/g, "'");
  const value = labelToValue[key];
  if (value === undefined) {
    const allowed = [...new Set(Object.values(labelToValue))].join(', ');
    return err(`Noto'g'ri qiymat. Ruxsat etilgan: ${allowed}`);
  }
  return good(value);
};
