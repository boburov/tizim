/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL QO'RIQCHISI (faqat TEST uchun) — PostgreSQL / Prisma versiyasi.
 *
 * NEGA KERAK (o'zgarmadi): ID-qidiruvchi test SONLARDAGI sizishni tuta
 * olmaydi. `count` `1` qaytaradi — javobda tekshiradigan ID yo'q. Aynan
 * shu sabab boshqaruv panelidagi 7 ta hisoblagich sizishi e'tibordan
 * chetda qolgan edi.
 *
 * BU QO'RIQCHI so'rovni bazaga ketishidan OLDIN ushlaydi: filialga
 * bog'langan modelga ANIQ filial konteksti ichida filtr-siz murojaat
 * qilinsa — yozib qo'yiladi. Javob soni, ro'yxati yoki bo'sh bo'lishidan
 * qat'i nazar.
 *
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * ILGARI: `mongoose.Query.prototype.exec` va `mongoose.Model.aggregate`
 * global tarzda o'raladi.
 *
 * ENDI: `config/prisma.js` eksport qiladigan YAGONA klientning model
 * delegatlari o'raladi (`prisma.group.findMany` va h.k.).
 *
 * ⚠ NEGA `$extends` EMAS: `$extends()` YANGI klient qaytaradi, sinalayotgan
 * servislar esa `config/prisma.js` dagi ESKI nusxani import qiladi va
 * kengaytmani KO'RMASDI. `$use()` (middleware) esa Prisma 5 dan boshlab
 * eskirgan va kengaytirilgan klientda umuman yo'q.
 *
 * Shuning uchun delegat metodlari joyida almashtiriladi — ular
 * `writable: true, configurable: true` (tekshirilgan), ya'ni bu
 * qo'llab-quvvatlanadigan yo'l.
 *
 * ⚠ FAQAT TESTDA: production'da bu fayl umuman import qilinmaydi.
 * `enableBranchGuard()` tiklovchi funksiya qaytaradi va uni chaqirish
 * klientni asl holiga qaytaradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import prisma from "../../src/config/prisma.js";
import { getBranchContext } from "../../src/helpers/branchContext.helper.js";

/**
 * Filialga bog'langan modellar va ularning ko'lam maydonlari.
 *
 * Kalitlar — PRISMA DELEGAT nomlari (`group`, `studentPayment`), Mongoose
 * model nomlari emas. Qiymatlar — filtrda ko'rinishi kutilgan maydonlar.
 *
 * ⚠ Bu ro'yxat `constants/resourceScope.js` reyestriga MOS bo'lishi
 * kerak; nomuvofiqlikni `tests/resourceScope.test.js` ushlaydi.
 */
const SCOPED = {
  // `branchId` ustuni bor
  group: ["branchId"],
  lead: ["branchId"],
  studentPayment: ["branchId"],
  paymentTransaction: ["branchId"],
  teacherSalary: ["branchId"],
  salaryTransaction: ["branchId"],
  depositTransaction: ["branchId"],
  approval: ["branchId"],
  expense: ["branchId"],
  refund: ["branchId"],
  // `branchId` YO'Q — guruh orqali bog'lanadi
  attendance: ["groupId", "branchId"],
  grade: ["groupId", "branchId"],
  groupMembership: ["groupId", "branchId"],
  groupFee: ["groupId", "branchId"],
  discount: ["groupId", "branchId"],
  teacherGroupPeriod: ["groupId", "branchId"],
  // foydalanuvchi ikki yo'l bilan bog'lanadi (yoki aniq ID bilan olinadi)
  user: ["homeBranchId", "branchAssignments", "id"],
};

/**
 * Kuzatiladigan amallar.
 *
 * `findUnique` ATAYLAB YO'Q: u DOIM birlamchi kalit bo'yicha aniq
 * so'rov, ya'ni "filtrsiz" bo'lishi mumkin emas.
 */
const WATCHED_OPS = ["findMany", "findFirst", "count", "aggregate", "groupBy"];

const violations = [];

export const getViolations = () => violations;
export const clearViolations = () => {
  violations.length = 0;
};

/** Filtr/argument ichida ko'lam maydoni bormi (ichma-ich ham qidiradi). */
const hasScopeKey = (obj, keys) => {
  if (!obj) return false;
  let json;
  try {
    json = JSON.stringify(obj);
  } catch {
    return true; // seriyalanmasa — shubha qilmaymiz
  }
  return keys.some((k) => json.includes(`"${k}"`));
};

/**
 * Qo'riqchini yoqadi. Buzilish topilsa `violations` ga yoziladi
 * (THROW QILMAYDI — bitta yurishda hammasini ko'rish uchun).
 *
 * @returns {() => void} klientni asl holiga qaytaruvchi funksiya
 */
export const enableBranchGuard = () => {
  /** @type {Array<[string, string, Function]>} */
  const originals = [];

  for (const [model, keys] of Object.entries(SCOPED)) {
    const delegate = prisma[model];
    if (!delegate) continue;

    for (const op of WATCHED_OPS) {
      const original = delegate[op];
      if (typeof original !== "function") continue;
      originals.push([model, op, original]);

      delegate[op] = function guarded(args, ...rest) {
        const ctx = getBranchContext();
        // Kontekst yo'q (job/seed) yoki konsolidatsiya rejimi —
        // tekshirmaymiz: ular ATAYLAB butun tarmoqni o'qiydi.
        if (ctx?.branchId && !hasScopeKey(args?.where ?? args, keys)) {
          violations.push({
            model,
            op,
            filter: JSON.stringify(args?.where ?? args ?? {}).slice(0, 160),
          });
        }
        return original.call(this, args, ...rest);
      };
    }
  }

  return () => {
    for (const [model, op, original] of originals) {
      prisma[model][op] = original;
    }
  };
};
