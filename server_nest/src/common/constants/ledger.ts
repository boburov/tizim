// ⚠ `server/src/constants/ledger.js` DAN AYNAN KO'CHIRILGAN.
// Qiymatlar `prisma/schema.prisma` dagi `AccountKind` va `EntryKind`
// enumlari bilan MOS bo'lishi SHART — ajralib ketsa Postgres yozuvni
// enum xatosi bilan rad etadi va foydalanuvchi tushunarsiz 500 ko'radi.
// Izohlar ATAYLAB saqlangan: ular qaror TARIXINI tashiydi.

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
// Daromad/xarajat hisoblari ATAYLAB kam sonli (revenue, expense,
// payment_fee, shortage) - ular yozuvni MUVOZANATLASH uchun. Tafsilot
// esa hisobda emas, YOZUV O'LCHOVLARIDA (JournalEntry.teacherId,
// courseId, roomId, expenseCategoryId...).
//
// NEGA SHUNDAY: har kesim uchun alohida hisob ochilsa (masalan har
// o'qituvchiga bittadan), hisoblar soni cheksiz o'sardi va yangi kesim
// qo'shish (xona bo'yicha foyda) butun hisoblar rejasini qayta qurishni
// talab qilardi. O'lchov ustuni esa shunchaki yana bitta GROUP BY.
//
// Shu sababdan foyda/zarar tahlili (Faza 15-19) hisob TURI bo'yicha
// emas, o'lchovlar bo'yicha yig'iladi. Qoidalar fayl oxirida:
// NON_OPERATING_ENTRY_KINDS, REVENUE_KINDS, COST_KINDS, isOperating().

export const ACCOUNT_KINDS = {
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

  // ── FAZA 3: QO'SHIMCHA PUL KANALLARI ──
  UZCARD: "uzcard",
  HUMO: "humo",
  // Boshqa/aralash kanal - aniq nomi Account.name da.
  OTHER: "other",

  // ── FAZA 13: EGASINING KAPITALI ──
  //
  // `EQUITY` DAN ATAYLAB AJRATILGAN va bu farq muhim:
  //   equity        - boshlang'ich qoldiqning qarshi tomoni. O'tmish,
  //                   bir marta yoziladi va boshqa qimirlamaydi.
  //   owner_capital - TIRIK oqim: egasi bugun pul qo'shdi yoki oldi.
  //
  // IKKALASI HAM DAROMAD/XARAJAT EMAS. Egasi 20 mln qo'shsa kassa
  // oshadi, lekin markaz hech narsa SOTMAGAN. Aralashtirilsa foyda
  // yolg'on ko'tarilib, eng muhim savol - "biznes O'ZI pul topayaptimi?"
  // - javobsiz qolardi. Aksincha: egasi pul yechganda "zarar" ko'rinardi.
  OWNER_CAPITAL: "owner_capital",

  // ── FAZA 12: TO'LOV TIZIMI KOMISSIYASI ──
  // `EXPENSE` dan ajratilgan: bu markaz QARORI bilan qilingan xarajat
  // emas, tushumdan avtomatik ushlanadigan ulush. Alohida hisob
  // "pul qabul qilish bizga qancha turadi?" degan savolga to'g'ridan-
  // to'g'ri javob beradi.
  PAYMENT_FEE: "payment_fee",
} as const;

export const ALL_ACCOUNT_KINDS: string[] = Object.values(ACCOUNT_KINDS);

// NORMAL QOLDIQ TOMONI.
//
// Aktiv va xarajat DEBET bilan o'sadi, passiv/kapital/daromad esa KREDIT
// bilan. Bu jadval bo'lmasa qoldiqni hisoblashda ishora chalkashardi:
// naqd pul qoldig'i (debet − kredit), qarz qoldig'i esa (kredit − debet).
export const NORMAL_SIDE: Record<string, 'debit' | 'credit'> = {
  [ACCOUNT_KINDS.CASH]: "debit",
  [ACCOUNT_KINDS.TERMINAL]: "debit",
  [ACCOUNT_KINDS.CLICK]: "debit",
  [ACCOUNT_KINDS.PAYME]: "debit",
  [ACCOUNT_KINDS.BANK]: "debit",
  [ACCOUNT_KINDS.TRANSIT]: "debit",
  [ACCOUNT_KINDS.DUE_FROM]: "debit",
  [ACCOUNT_KINDS.EXPENSE]: "debit",
  [ACCOUNT_KINDS.SHORTAGE]: "debit",
  [ACCOUNT_KINDS.UZCARD]: "debit",
  [ACCOUNT_KINDS.HUMO]: "debit",
  [ACCOUNT_KINDS.OTHER]: "debit",
  // Komissiya - xarajat tabiatli (debet bilan o'sadi).
  [ACCOUNT_KINDS.PAYMENT_FEE]: "debit",

  [ACCOUNT_KINDS.DUE_TO]: "credit",
  [ACCOUNT_KINDS.DEPOSIT]: "credit",
  [ACCOUNT_KINDS.EQUITY]: "credit",
  [ACCOUNT_KINDS.REVENUE]: "credit",
  // Egasi qo'shgan pul majburiyat tabiatli: markaz uni egasiga
  // "qarzdor". Kredit bilan o'sadi.
  [ACCOUNT_KINDS.OWNER_CAPITAL]: "credit",
};

// PUL TURGAN hisoblar - "filialda qancha pul bor" savoli shular yig'indisi.
// `transit` KIRADI: u hali ham filialning javobgarligidagi pul.
export const TREASURY_KINDS = [
  ACCOUNT_KINDS.CASH,
  ACCOUNT_KINDS.TERMINAL,
  ACCOUNT_KINDS.CLICK,
  ACCOUNT_KINDS.PAYME,
  ACCOUNT_KINDS.BANK,
  ACCOUNT_KINDS.TRANSIT,
  ACCOUNT_KINDS.UZCARD,
  ACCOUNT_KINDS.HUMO,
  ACCOUNT_KINDS.OTHER,
] as const;

// FILIALLARARO hisoblar - konsolidatsiyada ULAR o'zaro yo'q qilinadi.
export const INTER_BRANCH_KINDS = [
  ACCOUNT_KINDS.DUE_FROM,
  ACCOUNT_KINDS.DUE_TO,
] as const;

// To'lov kanali -> hisob turi. PaymentTransaction.method bilan bog'lash uchun.
// ⚠ TUR `Record<string, string>` — `as const` EMAS.
//
// Bu jadval XOM qiymat bilan indekslanadi (`expense.method`,
// `trx.method` — bazadan kelgan satr). `as const` bilan TypeScript
// faqat sanab o'tilgan kalitlarni qabul qilardi va har chaqiruv joyida
// qo'lda `as never` kerak bo'lardi — ya'ni tur xavfsizligi emas, tur
// SHOVQINI paydo bo'lardi. `NORMAL_SIDE` ham AYNAN shu sababdan
// shunday e'lon qilingan.
export const METHOD_TO_ACCOUNT: Record<string, string> = {
  cash: ACCOUNT_KINDS.CASH,
  card: ACCOUNT_KINDS.TERMINAL,
  terminal: ACCOUNT_KINDS.TERMINAL,
  click: ACCOUNT_KINDS.CLICK,
  payme: ACCOUNT_KINDS.PAYME,
  bank: ACCOUNT_KINDS.BANK,
  transfer: ACCOUNT_KINDS.BANK,
  uzcard: ACCOUNT_KINDS.UZCARD,
  humo: ACCOUNT_KINDS.HUMO,
  other: ACCOUNT_KINDS.OTHER,
};

// JURNAL YOZUVI TURLARI - "bu pul nega harakatlandi".
export const ENTRY_KINDS = {
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

  // ── FAZA 6: QAYTARIM ──
  // Asl to'lov O'ZGARTIRILMAYDI. Tarixda ikkala amal ham turadi.
  REFUND: "refund",

  // ── FAZA 13: egasining puli (operatsion natijaga KIRMAYDI) ──
  OWNER_INVESTMENT: "owner_investment",
  OWNER_WITHDRAWAL: "owner_withdrawal",

  // ── FAZA 12: to'lov tizimi komissiyasi ──
  PAYMENT_FEE: "payment_fee",

  // ── FAZA 3: HISOBLAR ORASIDA KO'CHIRISH (bitta filial ichida) ──
  // `TRANSFER_SEND`/`TRANSFER_RECEIVE` dan boshqa narsa: ular
  // FILIALLARARO inkassatsiya (yo'ldagi pul, ikki filial jurnali).
  // Bu esa bank -> kassa, bitta filial ichida.
  ACCOUNT_TRANSFER: "account_transfer",
} as const;

export const ALL_ENTRY_KINDS: string[] = Object.values(ENTRY_KINDS);

/**
 * Hisob qoldig'ini to'g'ri ishora bilan qaytaradi.
 *
 * @param {string} kind - hisob turi
 * @param {number} debit - jami debet
 * @param {number} credit - jami kredit
 */
export const signedBalance = (kind: string, debit = 0, credit = 0): number =>
  NORMAL_SIDE[kind] === "credit" ? credit - debit : debit - credit;

// ═══════════════════════════════════════════════════════════════════════
// OPERATSION NATIJA QOIDALARI (Faza 13, 15, 26)
// ═══════════════════════════════════════════════════════════════════════
//
// Talab: "Prevent double counting" va "Owner investment must not appear
// as operating revenue". Bu qoidalar BITTA joyda turishi shart - har
// hisobotda qaytadan yozilsa, ular MUQARRAR ajralib ketadi va ikki
// hisobot ikki xil "foyda" ko'rsatardi.

// PUL HARAKATI BOR, LEKIN OPERATSION EMAS.
//
// Bu yozuvlar kassa qoldig'ini O'ZGARTIRADI (ya'ni pul oqimi hisobotida
// KO'RINISHI SHART), lekin foyda hisobiga KIRMAYDI:
//   • egasining puli    - biznes hech narsa sotmagan
//   • hisoblar orasida  - pul bir cho'ntakdan ikkinchisiga o'tdi
//   • filiallararo      - tarmoq darajasida pul hech qayerga ketmagan
//
// Aynan shu ro'yxat "FOYDA ≠ KASSA QOLDIG'I" farqini tushuntiradi
// (Faza 11 talabi).
export const NON_OPERATING_ENTRY_KINDS = [
  ENTRY_KINDS.OWNER_INVESTMENT,
  ENTRY_KINDS.OWNER_WITHDRAWAL,
  ENTRY_KINDS.ACCOUNT_TRANSFER,
  ENTRY_KINDS.TRANSFER_SEND,
  ENTRY_KINDS.TRANSFER_RECEIVE,
  ENTRY_KINDS.INTER_BRANCH,
] as const;

// MOLIYALASHTIRISH oqimi - pul oqimi hisobotining uchinchi bo'limi
// (operatsion / investitsion / moliyalashtirish).
export const FINANCING_ENTRY_KINDS = [
  ENTRY_KINDS.OWNER_INVESTMENT,
  ENTRY_KINDS.OWNER_WITHDRAWAL,
] as const;

// FOYDA hisobiga kiradigan hisob turlari.
//
// `OWNER_CAPITAL` va `EQUITY` bu yerda YO'Q - ataylab (Faza 13).
// `DEPOSIT` ham yo'q: o'quvchi depoziti hali daromad emas, u faqat
// oylikka qoplanganda daromadga aylanadi (deposit_apply).
export const REVENUE_KINDS = [ACCOUNT_KINDS.REVENUE] as const;
export const COST_KINDS = [
  ACCOUNT_KINDS.EXPENSE,
  ACCOUNT_KINDS.PAYMENT_FEE,
  ACCOUNT_KINDS.SHORTAGE,
] as const;

/** Yozuv operatsion natijaga kiradimi? */
export const isOperating = (entryKind: string): boolean =>
  !(NON_OPERATING_ENTRY_KINDS as readonly string[]).includes(entryKind);
