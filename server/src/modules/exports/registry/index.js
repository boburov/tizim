import studentPaymentsDataset from "./studentPayments.dataset.js";
import teachersDataset from "./teachers.dataset.js";
import { hasPermission } from "../../../helpers/permission.helper.js";

// EKSPORT REYESTRI - ustunlarning YAGONA manbasi.
//
// NEGA reyestr (client'da takrorlash emas): client va server alohida
// paketlar, umumiy modul yo'q. Ustunlar ro'yxati ikki joyda saqlansa,
// vaqt o'tib albatta bir-biridan uzoqlashadi (biriga ustun qo'shiladi,
// ikkinchisiga yo'q). Shuning uchun client ustunlarni GET /datasets
// orqali SHU YERDAN oladi - drift jismonan mumkin emas.
//
// Ikkinchi foyda: ruxsat filtri ham shu yerda. Ruxsati yo'q ustun
// client'ga UMUMAN ko'rinmaydi va so'ralsa ham whitelist'dan o'tmaydi.
const DATASETS = Object.freeze({
  [studentPaymentsDataset.key]: studentPaymentsDataset,
  [teachersDataset.key]: teachersDataset,
});

export const getDataset = (key) => DATASETS[key] || null;

export const listDatasets = () => Object.values(DATASETS);

/**
 * Foydalanuvchi ruxsatiga ko'ra ustunlarni filtrlaydi.
 * Ustunda `permission` bo'lmasa - dataset ruxsati yetarli.
 */
export const visibleColumns = (dataset, permissions) =>
  dataset.columns.filter(
    (col) => !col.permission || hasPermission(permissions, col.permission),
  );

/**
 * Client so'ragan ustun kalitlarini reyestr bo'yicha OQ RO'YXATLAYDI.
 *
 * Reyestrda yo'q yoki ruxsat yetmaydigan kalit jimgina TASHLANADI -
 * xato qaytarilmaydi, chunki bu client'ga qaysi maydonlar mavjudligini
 * ("passwordHash bor ekan") oshkor qilardi.
 *
 * Tartib client'niki: foydalanuvchi ustunlarni qanday tartibda tanlagan
 * bo'lsa, Excel'da ham shunday chiqadi.
 *
 * @returns {Array} ustun tavsiflari (bo'sh bo'lishi mumkin)
 */
export const resolveColumns = (dataset, permissions, requestedKeys) => {
  const allowed = visibleColumns(dataset, permissions);
  if (!requestedKeys?.length) return allowed.filter((c) => c.default);

  const byKey = new Map(allowed.map((c) => [c.key, c]));
  const seen = new Set();
  const picked = [];
  for (const key of requestedKeys) {
    const col = byKey.get(key);
    if (!col || seen.has(key)) continue;
    seen.add(key);
    picked.push(col);
  }
  return picked;
};

export default DATASETS;
