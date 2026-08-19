/**
 * ══════════════════════════════════════════════════════════════════════
 * DRILL-DOWN GRAFI — "bu raqam qayerdan keldi?" (talab 11, 35)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Har muhim raqamning manba yozuvigacha YO'LI bor. Yo'l shu yerda
 * TA'RIFLANADI, har kartada qo'lda yozilmaydi.
 *
 * ── NEGA BITTA REYESTR ──
 * Zanjir sahifalar bo'ylab sochilsa, u MUQARRAR uzilib qoladi: bitta
 * jadval `onRowClick` ni unutadi va foydalanuvchi "nega?" degan
 * savolda devorga uriladi. Bir joyda bo'lsa — uzilgan bo'g'in ko'rinib
 * turadi va tekshirish skripti uni tuta oladi.
 *
 * ── HAR TUGUN NIMA QILADI ──
 *   filterKey  — tugun tahlil FILTRIGA qanday aylanadi. Shu tufayli
 *                ichki raqamlar tashqi jadval bilan MOS keladi:
 *                ikkalasi ham bir xil endpoint, faqat filtr qo'shilgan.
 *   label      — panel sarlavhasidagi tur nomi (odam tilida).
 *   children   — keyingi bo'g'in(lar). Ro'yxat: birinchisi asosiy.
 *   terminal   — zanjir shu yerda tugaydi (jurnal yozuvi).
 *
 * ── QAT'IY QOIDA ──
 * Bu yerda HECH QANDAY HISOB-KITOB yo'q. Grafik faqat qaysi
 * endpoint'ni qaysi filtr bilan chaqirishni aytadi. Moliyaviy
 * haqiqat — serverda (talab 28).
 */

export const DRILL_TYPES = Object.freeze({
  // ILDIZ TUGUNLAR — o'lchov emas, SAVOL.
  //
  // "Daromad 10 mln" raqamini bosgan odam biror filial yoki
  // yo'nalishni tanlamagan — u "bu pul QAYERDAN keldi?" deb
  // so'ragan. Shuning uchun zanjirning boshi o'lchov emas, savol
  // bo'lishi kerak (talab 34 dagi oqim aynan shunday boshlanadi).
  REVENUE: "revenue",
  EXPENSE: "expense",

  BRANCH: "branch",
  COURSE: "course",
  GROUP: "group",
  STUDENT: "student",
  TEACHER: "teacher",
  ROOM: "room",
  PERSON: "person",
  EXPENSE_CATEGORY: "expenseCategory",
  PAYMENT_METHOD: "paymentMethod",
  ACCOUNT: "account",
  ENTRY: "entry",
});

const T = DRILL_TYPES;

export const DRILL_NODES = Object.freeze({
  // ── ILDIZ: DAROMAD ──
  // Talab 34: Daromad → manbalar (yo'nalish) → guruh → o'quvchi →
  // to'lov → jurnal yozuvi.
  [T.REVENUE]: {
    label: "Daromad manbalari",
    // Filtri YO'Q: bu o'lchov emas, kirish nuqtasi. Sahifaning
    // joriy filtrlari (davr, filial) baribir meros bo'ladi.
    filterKey: null,
    children: [T.COURSE],
  },
  // ── ILDIZ: CHIQIM ──
  [T.EXPENSE]: {
    label: "Chiqim yo'nalishlari",
    filterKey: null,
    children: [T.EXPENSE_CATEGORY],
  },

  [T.BRANCH]: {
    label: "Filial",
    filterKey: "branchId",
    // Filialdan keyin — yo'nalish (nima sotilyapti) va chiqim turi
    // (pul qayerga ketyapti). Ikkalasi bitta panelda yonma-yon.
    children: [T.COURSE, T.EXPENSE_CATEGORY],
  },
  [T.COURSE]: {
    label: "Yo'nalish",
    filterKey: "courseId",
    children: [T.GROUP],
  },
  [T.GROUP]: {
    label: "Guruh",
    filterKey: "groupId",
    // Guruh ichida IKKI xil o'quvchi ro'yxati bor va ular BOSHQA
    // savolga javob beradi: kim TO'LADI (daromad) va kim TO'LAMADI
    // (qarz). Bittasini ko'rsatib ikkinchisini yashirish yarim
    // manzara bo'lardi.
    children: [T.STUDENT],
  },
  [T.STUDENT]: {
    label: "O'quvchi",
    filterKey: "studentId",
    children: [T.ENTRY],
  },
  [T.TEACHER]: {
    label: "O'qituvchi",
    filterKey: "teacherId",
    children: [T.GROUP],
  },
  [T.ROOM]: {
    label: "Xona",
    filterKey: "roomId",
    children: [T.GROUP],
  },
  [T.PERSON]: {
    // Maosh oluvchi: o'qituvchi ham, xodim ham. Jurnalda ikkalasi
    // ham `teacherId`/`staffId` bilan muhrlangan, lekin foydalanuvchi
    // uchun bu bitta tushuncha — "kimga to'landi".
    label: "Maosh oluvchi",
    filterKey: "teacherId",
    children: [T.ENTRY],
  },
  [T.EXPENSE_CATEGORY]: {
    label: "Chiqim turi",
    filterKey: "expenseCategoryId",
    children: [T.PERSON, T.ENTRY],
  },
  [T.PAYMENT_METHOD]: {
    label: "To'lov kanali",
    filterKey: "paymentMethod",
    children: [T.ENTRY],
  },
  [T.ACCOUNT]: {
    label: "Hisob",
    filterKey: "accountKind",
    children: [T.ENTRY],
  },
  [T.ENTRY]: {
    label: "Moliyaviy yozuv",
    terminal: true,
  },
});

/**
 * Tugunni tahlil filtriga aylantiradi.
 *
 * Bu funksiya `financeAnalytics/utils/targetFilter.js` ning
 * UMUMLASHTIRILGAN ko'rinishi: u faqat moliya sahifasi uchun edi,
 * bu esa butun ilova uchun.
 */
export const nodeFilter = (node) => {
  if (!node?.type || !node?.id) return {};
  const key = DRILL_NODES[node.type]?.filterKey;
  return key ? { [key]: node.id } : {};
};

/** Tugun zanjirini (stack) bitta filtr obyektiga yig'adi. */
export const stackFilters = (stack = [], base = {}) =>
  stack.reduce((acc, node) => ({ ...acc, ...nodeFilter(node) }), { ...base });

export const nodeLabel = (type) => DRILL_NODES[type]?.label || "Tafsilot";

export const isTerminal = (type) => Boolean(DRILL_NODES[type]?.terminal);

export default DRILL_NODES;
