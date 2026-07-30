import AiConfig, {
  AI_ENGINE_VERSION,
  DEFAULT_CHURN_WEIGHTS,
  DEFAULT_PAYMENT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_CONFIDENCE_FLOOR,
} from "../../../models/aiConfig.model.js";

// Konfiguratsiya yechimi: FILIAL → GLOBAL → koddagi default.
//
// Nega uch pog'ona: filial profili farq qilishi mumkin (universitet yonidagi
// filialda dushanba qoldirish normal), lekin har filialga alohida sozlama
// majburlash owner uchun ortiqcha yuk. Global qatlam standart bo'lib
// qoladi, filial faqat kerak bo'lganda ustidan yozadi.

const toPlain = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  // Map → oddiy obyekt (scoring qatlami Map bilan ishlamaydi).
  for (const key of ["churnWeights", "paymentWeights", "thresholds"]) {
    if (obj[key] instanceof Map) obj[key] = Object.fromEntries(obj[key]);
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
    branchId ? AiConfig.findOne({ branchId }).lean() : null,
    AiConfig.findOne({ branchId: null }).lean(),
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
  const set = { updatedBy: userId || null, engineVersion: AI_ENGINE_VERSION };
  if (patch.churnWeights) set.churnWeights = patch.churnWeights;
  if (patch.paymentWeights) set.paymentWeights = patch.paymentWeights;
  if (patch.thresholds) set.thresholds = patch.thresholds;
  if (patch.confidenceFloor != null) set.confidenceFloor = patch.confidenceFloor;
  if (patch.narrationEnabled != null) set.narrationEnabled = patch.narrationEnabled;
  if (patch.narrationModel) set.narrationModel = patch.narrationModel;

  const doc = await AiConfig.findOneAndUpdate(
    { branchId: branchId || null },
    { $set: set },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return toPlain(doc);
};
