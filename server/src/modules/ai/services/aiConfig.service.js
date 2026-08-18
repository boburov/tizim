import prisma from "../../../config/prisma.js";
import { AI_ENGINE_VERSION } from "../../../constants/ai.js";
import {
  DEFAULT_CHURN_WEIGHTS,
  DEFAULT_PAYMENT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_CONFIDENCE_FLOOR,
} from "../../../constants/aiDefaults.js";

// Konfiguratsiya yechimi: FILIAL → GLOBAL → koddagi default.
//
// Nega uch pog'ona: filial profili farq qilishi mumkin (universitet yonidagi
// filialda dushanba qoldirish normal), lekin har filialga alohida sozlama
// majburlash owner uchun ortiqcha yuk. Global qatlam standart bo'lib
// qoladi, filial faqat kerak bo'lganda ustidan yozadi.

// MONGO'DA BU MAP EDI, PRISMA'DA `Json`.
//
// Mongoose `Map<String, Number>` qaytarardi va scoring qatlami Map bilan
// ishlamagani uchun uni obyektga aylantirish kerak edi. Prisma `Json`
// ustunini ODDIY OBYEKT qilib qaytaradi, ya'ni aylantirish shart emas.
//
// Tekshiruv baribir qoldirildi: ustun `Json` bo'lgani uchun ichiga
// massiv yoki `null` ham tushishi mumkin (masalan qo'lda tahrirlangan
// qator) va u holda `{ ...null }` jimgina bo'sh obyekt berardi.
const toPlain = (row) => {
  if (!row) return null;
  const obj = { ...row };
  for (const key of ["churnWeights", "paymentWeights", "thresholds"]) {
    const v = obj[key];
    obj[key] = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }
  return obj;
};

export const CODE_DEFAULTS = Object.freeze({
  churnWeights: { ...DEFAULT_CHURN_WEIGHTS },
  paymentWeights: { ...DEFAULT_PAYMENT_WEIGHTS },
  thresholds: { ...DEFAULT_THRESHOLDS },
  confidenceFloor: DEFAULT_CONFIDENCE_FLOOR,
  narrationEnabled: false,
  narrationModel: "gemini-2.5-flash",
  engineVersion: AI_ENGINE_VERSION,
});

/**
 * Berilgan filial uchun amaldagi konfiguratsiyani qaytaradi.
 * @param {string|null} branchId
 */
export const resolveConfig = async (branchId = null) => {
  const [branchCfg, globalCfg] = await Promise.all([
    branchId
      ? prisma.aiConfig.findFirst({ where: { branchId: String(branchId) } })
      : null,
    // GLOBAL qator - `branchId IS NULL`. Bittadan ortiq bo'lmasligini
    // qisman unique indeks kafolatlaydi (`ai_configs_global_key`).
    prisma.aiConfig.findFirst({ where: { branchId: null } }),
  ]);

  const merged = { ...CODE_DEFAULTS };
  for (const cfg of [globalCfg, branchCfg]) {
    const plain = toPlain(cfg);
    if (!plain) continue;
    merged.churnWeights = { ...merged.churnWeights, ...(plain.churnWeights || {}) };
    merged.paymentWeights = { ...merged.paymentWeights, ...(plain.paymentWeights || {}) };
    merged.thresholds = { ...merged.thresholds, ...(plain.thresholds || {}) };
    if (plain.confidenceFloor != null) merged.confidenceFloor = plain.confidenceFloor;
    if (plain.narrationEnabled != null) merged.narrationEnabled = plain.narrationEnabled;
    if (plain.narrationModel) merged.narrationModel = plain.narrationModel;
  }
  return merged;
};

/** Global yoki filial konfiguratsiyasini yangilaydi (yo'q bo'lsa yaratadi). */
export const upsertConfig = async (branchId, patch, userId) => {
  // `updatedBy` -> `updatedById`: Prisma'da `updatedBy` RELATION.
  const set = {
    updatedById: userId ? String(userId) : null,
    engineVersion: AI_ENGINE_VERSION,
  };
  if (patch.churnWeights) set.churnWeights = patch.churnWeights;
  if (patch.paymentWeights) set.paymentWeights = patch.paymentWeights;
  if (patch.thresholds) set.thresholds = patch.thresholds;
  if (patch.confidenceFloor != null) set.confidenceFloor = patch.confidenceFloor;
  if (patch.narrationEnabled != null) set.narrationEnabled = patch.narrationEnabled;
  if (patch.narrationModel) set.narrationModel = patch.narrationModel;

  // `upsert` ISHLATILMAYDI: global qator `branchId IS NULL` bilan
  // aniqlanadi, Prisma `upsert` esa `where` da unique kalit talab qiladi
  // va `null` ni unique qiymat deb qabul qilmaydi (Postgres'da
  // `NULL != NULL`). Shu sababli find-then-write.
  const where = { branchId: branchId ? String(branchId) : null };
  const existing = await prisma.aiConfig.findFirst({ where });

  const doc = existing
    ? await prisma.aiConfig.update({ where: { id: existing.id }, data: set })
    : await prisma.aiConfig.create({
        data: {
          ...where,
          // Yangi qatorda `Json` ustunlar NOT NULL - schema'da default
          // yo'q, shuning uchun koddagi standartlar yoziladi.
          churnWeights: set.churnWeights || { ...DEFAULT_CHURN_WEIGHTS },
          paymentWeights: set.paymentWeights || { ...DEFAULT_PAYMENT_WEIGHTS },
          thresholds: set.thresholds || { ...DEFAULT_THRESHOLDS },
          ...set,
        },
      });
  return toPlain(doc);
};
