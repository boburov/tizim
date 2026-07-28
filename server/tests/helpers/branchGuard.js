import mongoose from "mongoose";
import { getBranchContext } from "../../src/helpers/branchContext.helper.js";

/**
 * FILIAL QO'RIQCHISI (faqat TEST uchun).
 *
 * NEGA KERAK: ID-qidiruvchi test SONLARDAGI sizishni tuta olmaydi.
 * `countDocuments` `1` qaytaradi - javobda tekshiradigan ObjectId yo'q.
 * Aynan shu sabab dashboard'dagi 7 ta hisoblagich sizishi e'tibordan
 * chetda qolgan edi.
 *
 * BU QO'RIQCHI so'rovni DB'ga ketishidan OLDIN ushlaydi: filialga
 * bog'langan modelga aniq filial konteksti ichida filtr-siz murojaat
 * qilinsa - xato. Javob soni, ro'yxati yoki bo'sh bo'lishidan qat'i nazar.
 *
 * FAQAT TESTDA: production'da hech qanday ta'siri yo'q.
 */

// Filialga bog'langan modellar va ularning scope maydoni.
const SCOPED = {
  // branchId ustuni bor
  Group: ["branchId"],
  Lead: ["branchId"],
  StudentPayment: ["branchId"],
  PaymentTransaction: ["branchId"],
  TeacherSalary: ["branchId"],
  SalaryTransaction: ["branchId"],
  DepositTransaction: ["branchId"],
  Approval: ["branchId"],
  // branchId YO'Q - guruh orqali bog'lanadi
  Attendance: ["group", "branchId"],
  Grade: ["group", "branchId"],
  GroupMembership: ["group", "branchId"],
  GroupFee: ["group", "branchId"],
  Discount: ["group", "branchId"],
  TeacherGroupPeriod: ["group", "branchId"],
  // foydalanuvchi ikki yo'l bilan bog'lanadi
  User: ["homeBranchId", "branchAssignments", "_id"],
};

const violations = [];

export const getViolations = () => violations;
export const clearViolations = () => {
  violations.length = 0;
};

// Filtr/pipeline ichida scope maydoni bormi (ichma-ich ham qidiradi).
const hasScopeKey = (obj, keys) => {
  if (!obj) return false;
  let json;
  try {
    json = JSON.stringify(obj);
  } catch {
    return true; // serializatsiya bo'lmasa - shubha qilmaymiz
  }
  return keys.some((k) => json.includes(`"${k}"`));
};

/**
 * Qo'riqchini yoqadi. Buzilish topilsa `violations` ga yoziladi
 * (throw QILMAYDI - bitta ishga tushirishda hammasini ko'rish uchun).
 */
export const enableBranchGuard = () => {
  const origExec = mongoose.Query.prototype.exec;
  const origAggregate = mongoose.Model.aggregate;

  mongoose.Query.prototype.exec = function guardedExec(...args) {
    const ctx = getBranchContext();
    // Kontekst yo'q (job/seed) yoki konsolidatsiya rejimi - tekshirmaymiz.
    if (ctx?.branchId) {
      const name = this.model?.modelName;
      const keys = SCOPED[name];
      if (keys && !hasScopeKey(this.getFilter?.(), keys)) {
        violations.push({
          model: name,
          op: this.op || "find",
          filter: JSON.stringify(this.getFilter?.() || {}).slice(0, 160),
        });
      }
    }
    return origExec.apply(this, args);
  };

  mongoose.Model.aggregate = function guardedAggregate(pipeline, ...rest) {
    const ctx = getBranchContext();
    if (ctx?.branchId && Array.isArray(pipeline)) {
      const name = this.modelName;
      const keys = SCOPED[name];
      if (keys && !hasScopeKey(pipeline, keys)) {
        violations.push({
          model: name,
          op: "aggregate",
          filter: JSON.stringify(pipeline).slice(0, 160),
        });
      }
    }
    return origAggregate.call(this, pipeline, ...rest);
  };

  return () => {
    mongoose.Query.prototype.exec = origExec;
    mongoose.Model.aggregate = origAggregate;
  };
};
