// QO'SH YOZUV (double-entry) - hisob turlari va qoidalari.
//
// ── NEGA QO'SH YOZUV ──
// Oddiy "tranzaksiya qatorlari + qoldiq" bilan boshlash vasvasasi bor edi,
// lekin uchta talab uni imkonsiz qiladi:
//
//   1. INKASSATSIYA - pul kassadan chiqdi, lekin markazga yetmadi.
//      "Yo'ldagi pul" holatini ifodalash uchun ikki tomon kerak.
//   2. FILIALLARARO QARZ - A filial B ning ijarasini to'lasa, bu A da
//      xarajat EMAS, B dan talab. Bir tomonlama yozuv buni ayta olmaydi.
//   3. ELIMINATION - konsolidatsiyada ichki o'tkazmalar ayirilishi kerak.
//      Ayirish uchun ular ALOHIDA belgilangan bo'lishi shart.
//
// Bularni keyin qo'shib bo'lmaydi: butun moliya qayta yoziladi.
//
// ── KO'LAM: FAQAT XAZINA (treasury) ──
// Bu jurnal PUL HARAKATINI yuritadi, to'liq buxgalteriya balansini emas.
// Tushum va xarajatning TAFSILOTI hamon o'z modellarida qoladi
// (PaymentTransaction, Expense, TeacherSalary) - ular operatsion haqiqat.
// Jurnal esa "qaysi kassada qancha pul bor" degan savolning YAGONA
// javobi bo'ladi.
//
// Shuning uchun daromad/xarajat hisoblari BITTA-BITTADAN (revenue,
// expense) - ular faqat yozuvni MUVOZANATLASH uchun. To'liq P&L
// tuzilmasi Faza 5 da, deferred revenue bilan birga quriladi.

export const ACCOUNT_KINDS = Object.freeze({
  // ── AKTIV: pul turgan joylar ──
  CASH: "cash", // naqd (kassa)
  TERMINAL: "terminal", // POS terminal
  CLICK: "click",
  PAYME: "payme",
  BANK: "bank", // bank hisob-raqami

  // YO'LDAGI PUL: kassadan chiqdi, lekin manzilga yetmadi.
  // Inkassatsiyaning butun ma'nosi shu hisobda.
  TRANSIT: "transit",

  // FILIALLARARO TALAB (aktiv): boshqa filial bizga qarzdor.
  DUE_FROM: "due_from",

  // ── PASSIV ──
  // FILIALLARARO MAJBURIYAT: biz boshqa filialga qarzdormiz.
  DUE_TO: "due_to",

  // O'QUVCHI DEPOZITI - ushlab turilgan, hali DAROMAD BO'LMAGAN pul.
  //
  // NEGA DAROMAD EMAS: depozit o'quvchiniki, markazniki emas. U faqat
  // oylik to'lovga QOPLANGANDA daromadga aylanadi. Kirim paytida
  // daromad deb yozilsa, tushum oldindan ko'tarilib ko'rinardi va
  // o'quvchi pulini qaytarib so'raganda "manfiy daromad" chiqardi.
  //
  // Shuning uchun oqim IKKI BOSQICHLI:
  //   to'ldirish: Debet naqd    / Kredit depozit   (majburiyat o'sdi)
  //   qoplash:    Debet depozit / Kredit daromad   (endi daromad)
  DEPOSIT: "deposit",

  // ── KAPITAL ──
  // Boshlang'ich qoldiq va tuzatishlarning qarshi tomoni.
  EQUITY: "equity",

  // ── DAROMAD / XARAJAT (faqat muvozanat uchun) ──
  REVENUE: "revenue",
  EXPENSE: "expense",
  // KAMOMAD: sanoqda yetishmagan pul. `expense` dan ATAYLAB ajratilgan -
  // u xarajat emas, YO'QOTISH va mas'ul shaxsga bog'lanadi.
  SHORTAGE: "shortage",
});

export const ALL_ACCOUNT_KINDS = Object.values(ACCOUNT_KINDS);

// NORMAL QOLDIQ TOMONI.
//
// Aktiv va xarajat DEBET bilan o'sadi, passiv/kapital/daromad esa KREDIT
// bilan. Bu jadval bo'lmasa qoldiqni hisoblashda ishora chalkashardi:
// naqd pul qoldig'i (debet − kredit), qarz qoldig'i esa (kredit − debet).
export const NORMAL_SIDE = Object.freeze({
  [ACCOUNT_KINDS.CASH]: "debit",
  [ACCOUNT_KINDS.TERMINAL]: "debit",
  [ACCOUNT_KINDS.CLICK]: "debit",
  [ACCOUNT_KINDS.PAYME]: "debit",
  [ACCOUNT_KINDS.BANK]: "debit",
  [ACCOUNT_KINDS.TRANSIT]: "debit",
  [ACCOUNT_KINDS.DUE_FROM]: "debit",
  [ACCOUNT_KINDS.EXPENSE]: "debit",
  [ACCOUNT_KINDS.SHORTAGE]: "debit",

  [ACCOUNT_KINDS.DUE_TO]: "credit",
  [ACCOUNT_KINDS.DEPOSIT]: "credit",
  [ACCOUNT_KINDS.EQUITY]: "credit",
  [ACCOUNT_KINDS.REVENUE]: "credit",
});

// PUL TURGAN hisoblar - "filialda qancha pul bor" savoli shular yig'indisi.
// `transit` KIRADI: u hali ham filialning javobgarligidagi pul.
export const TREASURY_KINDS = Object.freeze([
  ACCOUNT_KINDS.CASH,
  ACCOUNT_KINDS.TERMINAL,
  ACCOUNT_KINDS.CLICK,
  ACCOUNT_KINDS.PAYME,
  ACCOUNT_KINDS.BANK,
  ACCOUNT_KINDS.TRANSIT,
]);

// FILIALLARARO hisoblar - konsolidatsiyada ULAR o'zaro yo'q qilinadi.
export const INTER_BRANCH_KINDS = Object.freeze([
  ACCOUNT_KINDS.DUE_FROM,
  ACCOUNT_KINDS.DUE_TO,
]);

// To'lov kanali -> hisob turi. PaymentTransaction.method bilan bog'lash uchun.
export const METHOD_TO_ACCOUNT = Object.freeze({
  cash: ACCOUNT_KINDS.CASH,
  card: ACCOUNT_KINDS.TERMINAL,
  terminal: ACCOUNT_KINDS.TERMINAL,
  click: ACCOUNT_KINDS.CLICK,
  payme: ACCOUNT_KINDS.PAYME,
  bank: ACCOUNT_KINDS.BANK,
  transfer: ACCOUNT_KINDS.BANK,
});

// JURNAL YOZUVI TURLARI - "bu pul nega harakatlandi".
export const ENTRY_KINDS = Object.freeze({
  PAYMENT: "payment", // o'quvchi to'lovi (naqd/terminal kirimi)
  DEPOSIT_IN: "deposit_in", // depozitga to'ldirish
  DEPOSIT_OUT: "deposit_out", // depozitdan qaytarish
  DEPOSIT_APPLY: "deposit_apply", // depozitdan oylikka qoplash (daromadga aylanish)
  EXPENSE: "expense", // chiqim
  SALARY: "salary", // maosh to'lovi
  OPENING: "opening", // boshlang'ich qoldiq
  SHIFT_CLOSE: "shift_close", // smena yopilishi (kamomad/ortiqcha)
  TRANSFER_SEND: "transfer_send", // inkassatsiya jo'natildi
  TRANSFER_RECEIVE: "transfer_receive", // inkassatsiya qabul qilindi
  INTER_BRANCH: "inter_branch", // filiallararo qarz
  ADJUSTMENT: "adjustment", // qo'lda tuzatish
});

export const ALL_ENTRY_KINDS = Object.values(ENTRY_KINDS);

/**
 * Hisob qoldig'ini to'g'ri ishora bilan qaytaradi.
 *
 * @param {string} kind - hisob turi
 * @param {number} debit - jami debet
 * @param {number} credit - jami kredit
 */
export const signedBalance = (kind, debit = 0, credit = 0) =>
  NORMAL_SIDE[kind] === "credit" ? credit - debit : debit - credit;
