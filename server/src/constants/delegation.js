import { APPROVAL_KINDS } from "../models/approval.model.js";

// DELEGATSIYA MATRITSASI - filial rahbari qaysi SOZLAMA amalini o'zi hal
// qila oladi, qaysinisi owner tasdig'iga tushadi.
//
// NEGA KERAK BO'LDI: tekshiruv IKKILIK edi (expenseApproval.service.js dagi
// checkConfigApproval) - approvals.decide_config ruxsati bor bo'lsa HAMMASI
// darhol bajarilardi, yo'q bo'lsa HAMMASI tasdiqqa tushardi. O'rtasi yo'q edi,
// ya'ni owner'da ikki yomon tanlovdan biri qolardi:
//
//   (a) ruxsat BERMASLIK -> har bir xodim, har bir narx, har bir chegirma
//       owner orqali o'tadi. Owner kunini tasdiqlashga sarflaydi va aynan
//       shu narsa markazning o'sishini to'xtatadi.
//   (b) ruxsat BERISH    -> direktor O'Z so'rovini o'zi tasdiqlaydi
//       (approve() dagi "o'zini-o'zi tasdiqlash" taqiqi faqat AYNI hujjatga
//       tegishli - ruxsat bo'lsa so'rov umuman yaratilmaydi). Butun tasdiq
//       zanjiri ma'nosini yo'qotadi.
//
// Matritsa uchinchi yo'lni ochadi va uni FILIAL darajasida beradi:
// "Chilonzorning direktoriga ishonaman - xodimni o'zi olsin; chegirmani
// 20% gacha o'zi bersin; undan yuqorisini men ko'ray. Yangi ochilgan
// filialda esa hozircha hammasi men orqali."
//
// NAMUNA ALLAQACHON BOR: moliyaviy tomonda Branch.expenseApprovalThreshold
// aynan shu ishni qiladi (bitta amaliyot uchun summa chegarasi). Bu fayl -
// o'sha naqshning konfiguratsiya tomoniga yoyilishi.
//
// ── IKKI XIL "STANDART" - ATAYLAB AJRATILGAN ──
//
// DEFAULT_DELEGATION_MODE = "auto": qoida UMUMAN kiritilmagan bo'lsa.
//   Owner qarori: filial rahbari o'z filialida hamma narsani qila oladi,
//   owner esa kerak bo'lgan JOYNIGINA qaytarib oladi. Ya'ni matritsa
//   "ruxsat berish ro'yxati" emas, "cheklov ro'yxati".
//
// FALLBACK_DELEGATION_MODE = "approval": qoida BOR, lekin BUZUQ
//   (noma'lum rejim, turga to'g'ri kelmaydigan qiymat - masalan bazaga
//   qo'lda yozilgan). Bu yerda fail-closed SHART: buzuq qiymatni "auto"
//   deb o'qish bazaga tekkan har qanday odamga cheksiz huquq berardi.
//
// Ikkalasini bitta konstanta qilish MUMKIN EMAS: birinchisi qulaylik
// uchun ochiq, ikkinchisi xavfsizlik uchun yopiq bo'lishi kerak.

export const DELEGATION_MODES = Object.freeze({
  // Direktor o'zi bajaradi, tasdiq so'ralmaydi.
  AUTO: "auto",
  // Chegara ichida bo'lsa o'zi bajaradi, oshsa tasdiqqa tushadi.
  THRESHOLD: "threshold",
  // Doim owner tasdig'iga tushadi (standart holat).
  APPROVAL: "approval",
  // Umuman qila olmaydi - so'rov ham yaratilmaydi (403).
  FORBIDDEN: "forbidden",
});

export const ALL_DELEGATION_MODES = Object.values(DELEGATION_MODES);

// Qoidada saqlanadigan chegara maydonlari.
export const DELEGATION_LIMIT_FIELDS = Object.freeze([
  "maxAmount",
  "minAmount",
  "maxPercent",
]);

// Chegara YO'NALISHI: summa yuqoridan cheklanadimi yoki pastdan.
//
// Bu tafovut PRINSIPIAL. Chegirma va maosh uchun XAVF - katta raqam
// (ceiling: "20% gacha bera olasan"). Guruh NARXI uchun esa xavf TESKARI -
// kichik raqam: narxni 1 mln dan 400 ming ga tushirish barcha o'quvchiga
// chegirma berish bilan bir xil iqtisodiy ta'sirga ega (qarang
// approval.model.js dagi GROUP_FEE_SET izohi). Shuning uchun narx uchun
// chegara POL bo'ladi: "800 mingdan pastga tushirsang - mendan so'ra".
export const LIMIT_DIRECTIONS = Object.freeze({
  CEILING: "ceiling",
  FLOOR: "floor",
});

const { AUTO, THRESHOLD, APPROVAL, FORBIDDEN } = DELEGATION_MODES;

// DELEGATSIYA QILINADIGAN TURLAR.
//
// Faqat KONFIGURATSIYA turlari (approval.model.js dagi KIND_CATEGORY bo'yicha
// `configuration`). Moliyaviy turlar bu yerda ATAYLAB yo'q - ular
// Branch.expenseApprovalThreshold orqali allaqachon boshqariladi va ikkita
// parallel mexanizm bir-biriga zid javob berardi.
export const DELEGATABLE_KINDS = Object.freeze({
  [APPROVAL_KINDS.STAFF_HIRE]: {
    label: "Ishga olish",
    // O'lchanadigan summasi yo'q - THRESHOLD ma'nosiz.
    modes: [AUTO, APPROVAL, FORBIDDEN],
    limits: [],
    direction: null,
  },

  [APPROVAL_KINDS.DISCOUNT_SET]: {
    label: "Chegirma belgilash",
    modes: [AUTO, THRESHOLD, APPROVAL, FORBIDDEN],
    limits: ["maxAmount", "maxPercent"],
    direction: LIMIT_DIRECTIONS.CEILING,
  },

  [APPROVAL_KINDS.GROUP_FEE_SET]: {
    label: "Guruh oylik narxi",
    modes: [AUTO, THRESHOLD, APPROVAL, FORBIDDEN],
    limits: ["minAmount"],
    direction: LIMIT_DIRECTIONS.FLOOR,
  },

  // ── MAOSH TURLARI ──
  //
  // Bularda ham `auto` bor: filial rahbari o'z o'qituvchilarining
  // stavkasini o'zi belgilaydi (owner qarori).
  //
  // XAVF BOSHQA JOYDA YOPILGAN: asosiy tashvish "direktor cheksiz `auto`
  // bilan O'Z stavkasini o'zi belgilab oladi" edi. Buni butun toifani
  // bloklash bilan emas, ANIQ to'siq bilan yopish to'g'riroq - qarang
  // helpers/selfSalary.guard.js: hech kim (rejimdan va ruxsatdan qat'i
  // nazar) o'ziga maosh stavkasi belgilay olmaydi.
  //
  // Owner istagan payt bu turlarni `threshold` yoki `approval` ga
  // qaytara oladi - matritsa shuning uchun bor.
  [APPROVAL_KINDS.SALARY_TERMS]: {
    label: "Maosh stavkasi (guruh davri)",
    modes: [AUTO, THRESHOLD, APPROVAL, FORBIDDEN],
    limits: ["maxAmount", "maxPercent"],
    direction: LIMIT_DIRECTIONS.CEILING,
  },

  [APPROVAL_KINDS.TEACHER_COMPENSATION_SET]: {
    label: "O'qituvchi standart stavkasi",
    modes: [AUTO, THRESHOLD, APPROVAL, FORBIDDEN],
    limits: ["maxAmount", "maxPercent"],
    direction: LIMIT_DIRECTIONS.CEILING,
  },
});

export const ALL_DELEGATABLE_KINDS = Object.keys(DELEGATABLE_KINDS);

// Qoida kiritilmagan - filial rahbari o'zi hal qiladi.
export const DEFAULT_DELEGATION_MODE = AUTO;

// Qoida BOR, lekin buzuq - fail-closed (yuqoridagi izohga qarang).
export const FALLBACK_DELEGATION_MODE = APPROVAL;

/**
 * Mongoose Map ham, oddiy obyekt ham (lean / JSON) bir xil o'qilsin.
 * Map bo'lmasa `Object.entries` ishlaydi, bo'lsa `.entries()` kerak.
 */
export const normalizeDelegation = (delegation) => {
  if (!delegation) return {};
  if (typeof delegation.entries === "function" && !Array.isArray(delegation)) {
    return Object.fromEntries(delegation.entries());
  }
  return { ...delegation };
};

const emptyRule = (mode) => ({
  mode,
  maxAmount: null,
  minAmount: null,
  maxPercent: null,
});

/**
 * Bitta tur uchun qoidani qaytaradi.
 *
 * Qoida yo'q bo'lsa - `auto` (filial rahbari o'zi hal qiladi).
 * Qoida buzuq bo'lsa - `approval` (fail-closed).
 */
export const resolveRule = (delegation, kind) => {
  const map = normalizeDelegation(delegation);
  const raw = map[kind];
  const spec = DELEGATABLE_KINDS[kind];

  // NOMA'LUM TUR - delegatsiya qilinmaydi, ya'ni matritsa bu turga
  // umuman taalluqli emas. Fail-closed: tasdiqqa yuboriladi.
  //
  // DIQQAT: bu YAGONA joy bo'lib, u yerda "qoida yo'q" degani "auto"
  // EMAS. Sabab: bu turlar (moliyaviy tasdiqlar) BOSHQA mexanizm bilan
  // boshqariladi va ularni jimgina ochib yuborish xato bo'lardi.
  if (!spec) return emptyRule(FALLBACK_DELEGATION_MODE);

  // QOIDA KIRITILMAGAN - standart: rahbar o'zi hal qiladi.
  if (!raw || !raw.mode) return emptyRule(DEFAULT_DELEGATION_MODE);

  // HIMOYA QATLAMI: bazaga to'g'ridan-to'g'ri yozilgan (mongosh, eski
  // migratsiya, qo'lda tuzatish) NOTO'G'RI rejim shu yerda to'xtatiladi.
  // Validator faqat API orqali kelgan yozuvni ushlaydi, bu esa O'QISHDA
  // ishlaydi - ya'ni chetlab o'tilgan yozuv ham ta'sir qilmaydi.
  //
  // Bu yerda ALBATTA fail-closed: buzuq qiymatni `auto` deb o'qish
  // bazaga tekkan odamga cheksiz huquq berardi.
  if (!spec.modes.includes(raw.mode)) return emptyRule(FALLBACK_DELEGATION_MODE);

  return {
    mode: raw.mode,
    maxAmount: raw.maxAmount ?? null,
    minAmount: raw.minAmount ?? null,
    maxPercent: raw.maxPercent ?? null,
  };
};

/**
 * Matritsani tekshiradi. Xato bo'lsa matn qaytaradi, to'g'ri bo'lsa null.
 *
 * Servis qatlami ham, model'ning pre("validate") hook'i ham shuni chaqiradi -
 * ikki joyda ikki xil qoida bo'lib qolmasligi uchun yagona manba.
 */
export const validateDelegation = (delegation) => {
  const map = normalizeDelegation(delegation);

  for (const [kind, rule] of Object.entries(map)) {
    const spec = DELEGATABLE_KINDS[kind];
    if (!spec) {
      return `Delegatsiya qilib bo'lmaydigan tur: ${kind}`;
    }
    if (!rule || typeof rule !== "object") {
      return `${spec.label}: qoida noto'g'ri`;
    }

    const mode = rule.mode;
    if (!ALL_DELEGATION_MODES.includes(mode)) {
      return `${spec.label}: noma'lum rejim "${mode}"`;
    }
    if (!spec.modes.includes(mode)) {
      // Eng muhim xabar: maosh turlarida `auto` shu yerda to'xtatiladi.
      return `${spec.label}: "${mode}" rejimi bu tur uchun ruxsat etilmagan`;
    }

    // Chegara faqat THRESHOLD'da ma'noga ega.
    if (mode === THRESHOLD) {
      const provided = spec.limits.filter(
        (f) => rule[f] !== null && rule[f] !== undefined,
      );
      if (provided.length === 0) {
        return `${spec.label}: "threshold" rejimi uchun kamida bitta chegara kerak (${spec.limits.join(", ")})`;
      }
      for (const field of provided) {
        const v = Number(rule[field]);
        if (!Number.isFinite(v) || v < 0) {
          return `${spec.label}: ${field} musbat son bo'lishi kerak`;
        }
        if (field === "maxPercent" && v > 100) {
          return `${spec.label}: maxPercent 100 dan oshmasligi kerak`;
        }
      }
    }

    // Bu turga tegishli bo'lmagan chegara kiritilgan bo'lsa - ogohlantiramiz.
    // Jimgina e'tiborsiz qoldirilsa, owner "10% qo'ydim" deb o'ylab yurardi,
    // aslida esa qoida umuman qo'llanmasdi.
    for (const field of DELEGATION_LIMIT_FIELDS) {
      const has = rule[field] !== null && rule[field] !== undefined;
      if (has && !spec.limits.includes(field)) {
        return `${spec.label}: ${field} bu tur uchun qo'llanmaydi (${spec.limits.join(", ") || "chegara yo'q"})`;
      }
    }
  }

  return null;
};
