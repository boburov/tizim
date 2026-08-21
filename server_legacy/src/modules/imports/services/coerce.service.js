import { normalizePhone } from "../../../utils/phone.js";
import { parseLocalDay } from "../../../helpers/attendance.helper.js";

// UMUMIY MAYDON TEKSHIRUVCHILARI.
//
// Har biri { ok, value, error } qaytaradi - throw QILMAYDI. Sabab: bitta
// qatordagi xato butun importni to'xtatmasligi kerak, aksincha qator
// bo'yicha yig'ilib foydalanuvchiga ro'yxat bo'lib ko'rsatiladi.
//
// NEGA mavjud helperlar qayta ishlatiladi (normalizePhone, parseLocalDay):
// import orqali kelgan ma'lumot UI orqali kelgan ma'lumot bilan AYNAN bir
// xil qoidalardan o'tishi shart. Alohida parser yozilsa, import "yon eshik"
// bo'lib qolardi - masalan UI rad etadigan sanani import qabul qilardi.

const err = (message) => ({ ok: false, value: null, error: message });
const good = (value) => ({ ok: true, value, error: null });

export const isBlank = (v) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export const asText = (raw, { max = 500 } = {}) => {
  if (isBlank(raw)) return good("");
  const text = String(raw).trim();
  if (text.length > max) return err(`Matn juda uzun (${max} belgidan oshmasin)`);
  return good(text);
};

// Sonlarni Excel'dan kelgan turli ko'rinishda qabul qiladi:
// 1200000 | "1 200 000" | "1,200,000" | "1200000.50" | "1 200 000 so'm"
export const asNumber = (raw, { min, max, integer = false } = {}) => {
  if (isBlank(raw)) return err("Bo'sh");
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return err("Son noto'g'ri");
    return checkRange(raw, { min, max, integer });
  }

  // Bo'shliq va ajratgichlarni tozalaymiz. Vergul o'nlik ajratgich ham
  // bo'lishi mumkin ("1200,50") - faqat oxirgi vergul o'nlik deb olinadi
  // agar undan keyin 1-2 raqam bo'lsa.
  let text = String(raw).replace(/[\s ]/g, "");
  text = text.replace(/so'm|som|sum|uzs/gi, "");
  if (/^-?[\d.]+,\d{1,2}$/.test(text)) text = text.replace(",", ".");
  else text = text.replace(/,/g, "");

  if (text === "" || !/^-?\d*\.?\d+$/.test(text)) return err("Son emas");
  const num = Number(text);
  if (!Number.isFinite(num)) return err("Son noto'g'ri");
  return checkRange(num, { min, max, integer });
};

const checkRange = (num, { min, max, integer }) => {
  if (integer && !Number.isInteger(num)) return err("Butun son bo'lishi kerak");
  if (min !== undefined && num < min) return err(`${min} dan kichik bo'lmasin`);
  if (max !== undefined && num > max) return err(`${max} dan katta bo'lmasin`);
  return good(num);
};

export const asMoney = (raw, { min = 0, max } = {}) => {
  const res = asNumber(raw, { min, max });
  if (!res.ok) return res;
  // Tiyin yo'q - so'm butun son. 0.5 so'm kiritilsa yaxlitlash jimgina
  // pul yo'qotardi, shuning uchun aniq xato beramiz.
  if (!Number.isInteger(res.value)) return err("Butun son bo'lishi kerak (tiyin yo'q)");
  return res;
};

// Sana: Excel Date katagi, "2025-06-15", "15.06.2025", "15/06/2025".
export const asDate = (raw, { future = false } = {}) => {
  if (isBlank(raw)) return err("Bo'sh");

  let input = raw;
  if (!(raw instanceof Date)) {
    const text = String(raw).trim();
    // dd.mm.yyyy yoki dd/mm/yyyy -> yyyy-mm-dd (parseLocalDay ISO kutadi).
    const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
    if (m) {
      const [, d, mo, y] = m;
      input = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    } else {
      input = text;
    }
  }

  const day = parseLocalDay(input);
  if (!day) return err("Sana noto'g'ri (kutilgan format: 2025-06-15 yoki 15.06.2025)");
  if (!future) {
    const today = parseLocalDay(new Date());
    if (day.getTime() > today.getTime()) return err("Sana kelajakda bo'lishi mumkin emas");
  }
  return good(day);
};

export const asPhone = (raw) => {
  if (isBlank(raw)) return err("Bo'sh");
  const phone = normalizePhone(raw);
  if (!phone) return err("Telefon raqam noto'g'ri (masalan 998901234567)");
  return good(phone);
};

export const asYear = (raw) => asNumber(raw, { min: 2000, max: 3000, integer: true });

export const asMonth = (raw) => {
  const res = asNumber(raw, { min: 1, max: 12, integer: true });
  if (!res.ok && String(raw ?? "").trim() !== "") {
    // "iyun" kabi oy nomi ham qabul qilinsin - foydalanuvchi Excel'da
    // oyni matn qilib yozishi juda keng tarqalgan.
    const idx = MONTH_NAMES.findIndex((names) =>
      names.includes(String(raw).trim().toLowerCase()),
    );
    if (idx >= 0) return good(idx + 1);
  }
  return res;
};

const MONTH_NAMES = [
  ["yanvar", "january", "январь", "1-oy"],
  ["fevral", "february", "февраль", "2-oy"],
  ["mart", "march", "март", "3-oy"],
  ["aprel", "april", "апрель", "4-oy"],
  ["may", "мая", "май", "5-oy"],
  ["iyun", "june", "июнь", "6-oy"],
  ["iyul", "july", "июль", "7-oy"],
  ["avgust", "august", "август", "8-oy"],
  ["sentabr", "september", "сентябрь", "9-oy"],
  ["oktabr", "october", "октябрь", "10-oy"],
  ["noyabr", "november", "ноябрь", "11-oy"],
  ["dekabr", "december", "декабрь", "12-oy"],
];

/**
 * Ro'yxatdan tanlov. Yorliq (o'zbekcha) ham, kod (inglizcha) ham qabul
 * qilinadi - foydalanuvchi eksportdan ko'chirib qo'yishi mumkin.
 *
 * @param {*} raw
 * @param {Record<string,string>} labelToValue - {"naqd": "cash", "cash": "cash"}
 */
export const asEnum = (raw, labelToValue, { fallback } = {}) => {
  if (isBlank(raw)) {
    if (fallback !== undefined) return good(fallback);
    return err("Bo'sh");
  }
  const key = String(raw).trim().toLowerCase().replace(/['’ʻ`]/g, "'");
  const value = labelToValue[key];
  if (value === undefined) {
    const allowed = [...new Set(Object.values(labelToValue))].join(", ");
    return err(`Noto'g'ri qiymat. Ruxsat etilgan: ${allowed}`);
  }
  return good(value);
};
