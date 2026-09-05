// ⚠ `server_legacy/src/constants/resourceScope.js` DAN KO'CHIRILGAN.
//
// `test/` DA TURADI, `src/` DA EMAS — ATAYLAB: bu reyestrni ISH VAQTIDA
// hech kim import qilmaydi (Express tomonida ham shunday edi — yagona
// iste'molchisi testlar). Uni `src/` ga qo'yish "ilova buni ishlatadi"
// degan yolg'on taassurot berardi.
//
// RESURS KO'LAMI REYESTRI - har bir model filialga QANDAY bog'langan.
//
// NEGA KERAK BO'LDI: "bu modelga branchId keraksiz keraksizmi" savoli
// har safar QO'LDA, xotiradan hal qilinardi. Natijada uch xil xato
// takrorlanib turdi:
//
//   1. Yangi model qo'shildi, branchId unutildi -> ro'yxat butun
//      markazni ko'rsatadi (Feedback va ActivityLog aynan shunday edi).
//   2. Model branchId'siz, lekin uni bog'lash yo'li hujjatlashtirilmagan ->
//      keyingi dasturchi "demak global" deb o'ylaydi.
//   3. Test yozildi, lekin o'sha model uchun MA'LUMOT yaratilmadi ->
//      bo'sh natija "toza" bo'lib chiqadi va sizish yashirin qoladi
//      (branchLeak testidagi soxta o'tish aynan shu edi).
//
// Endi javob DEKLARATSIYA: har bir model shu yerda ro'yxatdan o'tadi.
// tests/resourceScope.test.js reyestrni modellar bilan solishtiradi -
// ro'yxatdan tushib qolgan model DARHOL yiqiladi.

export const SCOPE = Object.freeze({
  // Modelda `branchId` maydoni BOR -> branchFilter() / branchMatchStage()
  BRANCH: "branch",
  // `branchId` BOR, lekin u FILTR KALITI emas, ISTISNO BELGISI:
  // null = butun tarmoqqa tegishli qator.
  //
  // Bunday modelni branchFilter() bilan kesib bo'lmaydi - bazaviy
  // (branchId: null) qator hammaga kerak va u filtrdan tushib qolardi.
  // Filtrlash resolver ichida, aniq qoida bilan bo'ladi.
  BRANCH_OPTIONAL: "branch-optional",
  // IKKI filialga tegishli: `branchId` o'rniga `fromBranchId` +
  // `toBranchId`. Filtr ikkala maydon bo'yicha $or bilan quriladi.
  BRANCH_PAIR: "branch-pair",
  // branchId YO'Q, GURUH orqali bog'lanadi -> branchGroupFilter()
  VIA_GROUP: "via-group",
  // branchId YO'Q, FOYDALANUVCHI orqali bog'lanadi -> branchUserFilter()
  VIA_USER: "via-user",
  // branchId YO'Q, IKKI yo'ldan biri bilan (guruh YOKI foydalanuvchi)
  VIA_GROUP_OR_USER: "via-group-or-user",
  // branchId YO'Q, OTA YOZUV orqali bog'lanadi (guruh ham, foydalanuvchi
  // ham emas - masalan `journalLine` -> `journalEntry`).
  //
  // NEGA ALOHIDA TUR KERAK BO'LDI: bunday qatorni `global` deb belgilash
  // XATO bo'lardi (u filialga tegishli), `via-group`/`via-user` esa
  // noto'g'ri yo'lni ko'rsatardi. Filtrlash DOIM otani yuklash orqali
  // ketadi - ya'ni bola qatorni ota-siz so'rash o'z-o'zidan xato.
  VIA_PARENT: "via-parent",
  // Butun markazga umumiy taksonomiya/sozlama - filtrlanmaydi.
  GLOBAL: "global",
  // Filial o'lchovi YO'Q va bo'lishi ham SHART emas (infratuzilma).
  INFRA: "infra",
});

export const RESOURCE_SCOPE = Object.freeze({
  // ── FILIAL MAYDONI BOR ──
  aiConfig: SCOPE.BRANCH,
  aiRanking: SCOPE.BRANCH,
  aiReport: SCOPE.BRANCH,
  aiRun: SCOPE.BRANCH,
  aiUsageLog: SCOPE.BRANCH,
  approval: SCOPE.BRANCH,
  assignment: SCOPE.BRANCH,
  depositTransaction: SCOPE.BRANCH,
  expense: SCOPE.BRANCH,
  expenseCategory: SCOPE.BRANCH,
  group: SCOPE.BRANCH,
  importJob: SCOPE.BRANCH,
  insight: SCOPE.BRANCH,
  kpiRule: SCOPE.BRANCH,
  lead: SCOPE.BRANCH,
  // YO'NALTIRISH QOIDASI: qaysi manbadan kelgan lid qaysi filialga
  // tushadi. `branchId` bor va u NISHON filial - shuning uchun
  // qoidalar ro'yxati KESILMAYDI: owner butun xaritani ko'rishi
  // kerak, aks holda "nega lid bizga kelmayapti" savoli javobsiz
  // qolardi. Route `leads.manage` bilan himoyalangan.
  leadRoutingRule: SCOPE.BRANCH,
  openingBalance: SCOPE.BRANCH,
  // QAYTARIM - `branchId` MAJBURIY: pul qaysi filial kassasidan
  // chiqqanini bilmasdan qaytarib bo'lmaydi.
  refund: SCOPE.BRANCH,
  // FOYDALANUVCHI <-> FILIAL bog'lanishi. Bu jadval ko'lamning O'ZINI
  // belgilaydi, lekin `branchId` maydoni bor - demak u ham filtrlanadi
  // (masalan "shu filialga biriktirilganlar" ro'yxati).
  userBranchAssignment: SCOPE.BRANCH,
  // XONA - filialning FIZIK resursi (Faza 3). Kursdan farqli ravishda
  // filialga bog'langan: "3-xona" har filialda boshqa xona.
  room: SCOPE.BRANCH,
  // ── QO'SH YOZUV (Faza 4) ──
  // Hisob va jurnal yozuvi DOIM bitta filialga tegishli. Filiallararo
  // o'tkazma IKKI yozuv bilan ifodalanadi (har filialda bittadan) -
  // shunda har bir filialning jurnali o'zicha muvozanatda qoladi.
  account: SCOPE.BRANCH,
  journalEntry: SCOPE.BRANCH,
  shift: SCOPE.BRANCH,
  paymentTransaction: SCOPE.BRANCH,
  salaryTransaction: SCOPE.BRANCH,
  staffCompensation: SCOPE.BRANCH,
  staffPayroll: SCOPE.BRANCH,
  staffPayrollAdjustment: SCOPE.BRANCH,
  staffSalaryTransaction: SCOPE.BRANCH,
  studentPayment: SCOPE.BRANCH,
  teacherCompensation: SCOPE.BRANCH,
  teacherSalary: SCOPE.BRANCH,
  // ── TANGA VA MARKET ──
  // LEDGER YOZUVI - `branchId` bor va u ODATIY filtr kaliti:
  // coin.service.ts dagi stats() uni to'g'ridan-to'g'ri
  // branchFilter('branchId') bilan kesadi. Ustun NULL bo'la oladi,
  // lekin NULL "butun tarmoq" degani EMAS - u "filial aniqlanmagan"
  // (qo'lda berishda filial berilmagan) degani. Shuning uchun
  // branch-optional EMAS: bunday qatorning kesilib tushishi to'g'ri.
  coinTransaction: SCOPE.BRANCH,
  // XARID - `branchId` XARIDORNING filiali. Ro'yxat branchFilter()
  // bilan, `:id` esa assertOrderInScope() bilan kesiladi va u NULL
  // filialni ham yopadi (`!order.branchId` -> 404), ya'ni fail-closed.
  // Mahsulotdagi "null = markaz umumiysi" holati bu yerda TAKRORLANMAYDI.
  marketOrder: SCOPE.BRANCH,
  // Foydalanuvchi ALOHIDA shaklda: homeBranchId + branchAssignments[].
  // Shuning uchun uning filtri userBranchCondition() (branchFilter emas).
  user: SCOPE.VIA_USER,

  // ── FILIAL ISTISNOSI (branchId bor, null = butun tarmoq) ──
  // NARX MATRITSASI: branchId = null -> bazaviy narx, branchId = <id> ->
  // shu filial uchun istisno. branchFilter() bilan kesilsa bazaviy qator
  // yo'qolib, filialda narx umuman topilmasdi (coursePrice.service.js).
  coursePrice: SCOPE.BRANCH_OPTIONAL,
  // BYUDJET - `branchId` NULL bo'lishi mumkin: markaz butun tarmoq
  // uchun bitta byudjet tuzishi mumkin va u HAMMAGA ko'rinishi kerak.
  budget: SCOPE.BRANCH_OPTIONAL,
  // TAKRORLANUVCHI CHIQIM va uning oylik hodisalari - xuddi shunday:
  // `branchId` null bo'lsa chiqim butun markazniki (ijara, litsenziya).
  recurringExpense: SCOPE.BRANCH_OPTIONAL,
  recurringExpenseOccurrence: SCOPE.BRANCH_OPTIONAL,
  // MOLIYAVIY AUDIT IZI - `branchId` null bo'lishi mumkin (tarmoq
  // darajasidagi amal). Iz HECH QACHON o'chirilmaydi, shuning uchun
  // uni filtrlash faqat KO'RSATISH uchun.
  financialAuditLog: SCOPE.BRANCH_OPTIONAL,
  // MARKET MAHSULOTI - `branchId = null` MARKAZ UMUMIYSI va u BARCHA
  // filiallarda ko'rinishi kerak (faqat owner qo'ya oladi).
  // branchFilter() bilan kesilsa `NULL = 'X'` hech qachon rost
  // bo'lmaydi va umumiy mahsulot ro'yxatdan JIMGINA yo'qolardi -
  // shuning uchun market.service.ts `OR: [{ branchId: null }, <ko'lam>]`
  // shaklini ishlatadi. coursePrice bilan AYNI naqsh.
  marketProduct: SCOPE.BRANCH_OPTIONAL,

  // ── IKKI FILIALGA TEGISHLI ──
  // Inkassatsiyada IKKI filial bor: jo'natuvchi va qabul qiluvchi.
  // Shuning uchun `branchId` maydoni yo'q - `fromBranchId` va
  // `toBranchId`. Ro'yxat IKKALASI bo'yicha filtrlanadi, aks holda
  // qabul qiluvchi kutilayotgan pulni umuman ko'rmasdi
  // (cashTransfer.service.js dagi list()).
  cashTransfer: SCOPE.BRANCH_PAIR,

  // ── GURUH ORQALI ──
  attendance: SCOPE.VIA_GROUP,
  attendanceExemption: SCOPE.VIA_GROUP,
  debtWriteOff: SCOPE.VIA_GROUP,
  discount: SCOPE.VIA_GROUP,
  grade: SCOPE.VIA_GROUP,
  groupFee: SCOPE.VIA_GROUP,
  groupMembership: SCOPE.VIA_GROUP,
  lessonCancellation: SCOPE.VIA_GROUP,
  teacherAbsence: SCOPE.VIA_GROUP,
  teacherAttendance: SCOPE.VIA_GROUP,
  teacherGroupPeriod: SCOPE.VIA_GROUP,
  // DARS JADVALI - guruhning ajralmas qismi (Mongo'da embedded massiv
  // edi, Prisma'da alohida jadval).
  groupScheduleItem: SCOPE.VIA_GROUP,

  // ── FOYDALANUVCHI ORQALI ──
  activityLog: SCOPE.VIA_USER,
  studentDeposit: SCOPE.VIA_USER,
  studentFreeze: SCOPE.VIA_USER,
  staffKpiAssignment: SCOPE.VIA_USER,
  notificationRecipient: SCOPE.VIA_USER,
  assignmentRecipient: SCOPE.VIA_USER,
  archiveLog: SCOPE.VIA_USER,
  payrollAuditLog: SCOPE.VIA_USER,
  staffPayrollItem: SCOPE.VIA_USER,
  // HAMYON - foydalanuvchiga BITTA, `branchId` maydoni YO'Q. Reyting
  // (coin.service.ts leaderboard) uni `user` bog'lanishi orqali
  // userBranchCondition() bilan kesadi; boshqa odamning hamyoni esa
  // controller'da assertUserInBranchScope() bilan yopiladi.
  coinAccount: SCOPE.VIA_USER,

  // ── IKKI YO'LDAN BIRI ──
  // Fikr guruhsiz ham, anonim ham bo'lishi mumkin - shuning uchun
  // muallif YOKI guruh bo'yicha bog'lanadi (feedback.service.js).
  feedback: SCOPE.VIA_GROUP_OR_USER,
  // Xabar oluvchilar orqali; yuborishda auditoriya filtrlanadi
  // (notifications.service.js dagi withBranchScope).
  notification: SCOPE.VIA_GROUP_OR_USER,

  // ── MARKAZ BO'YLAB UMUMIY (taksonomiya va sozlamalar) ──
  // Bular ATAYLAB global: filiallar o'zicha yangi nom o'ylab topsa,
  // hisobotlarni birlashtirib bo'lmasdi.
  archiveReason: SCOPE.GLOBAL,
  attendanceSettings: SCOPE.GLOBAL,
  branch: SCOPE.GLOBAL,
  // TANGA SOZLAMASI - yagona qator (`id = "default"`),
  // attendanceSettings naqshi. `branchId` YO'Q va ATAYLAB yo'q: tanga
  // narxi bir filialda 1, boshqasida 5 bo'lsa bitta markaz ichida ikki
  // xil qoida paydo bo'lardi va o'quvchilar buni adolatsizlik deb
  // o'qirdi. Asosiy o'chirgich ham shu qatorda.
  coinSettings: SCOPE.GLOBAL,
  course: SCOPE.GLOBAL,
  feedbackType: SCOPE.GLOBAL,
  holiday: SCOPE.GLOBAL,
  leadOption: SCOPE.GLOBAL,
  notificationTemplate: SCOPE.GLOBAL,
  permission: SCOPE.GLOBAL,
  ratingSettings: SCOPE.GLOBAL,
  role: SCOPE.GLOBAL,
  storageSettings: SCOPE.GLOBAL,
  systemNotification: SCOPE.GLOBAL,

  // ── OTA YOZUV ORQALI (guruh ham, foydalanuvchi ham emas) ──
  //
  // Bularning HAMMASI moliyaviy: ular otasi bilan birga o'qiladi va
  // ALOHIDA so'ralmaydi. Shuning uchun ko'lam otada hal qilinadi.
  budgetLine: SCOPE.VIA_PARENT, // -> budget
  debtWriteOffBreakdown: SCOPE.VIA_PARENT, // -> debtWriteOff (via-group)
  journalLine: SCOPE.VIA_PARENT, // -> journalEntry (branch)

  // ── INFRATUZILMA (filial o'lchovi ma'nosiz) ──
  botLock: SCOPE.INFRA,
  botUser: SCOPE.INFRA,
  cache: SCOPE.INFRA,
  // TARIF KESHI - yagona qator ("singleton"), heartbeat javobining
  // o'zgartirilmagan nusxasi (entitlement-cache.store.ts). Litsenziya
  // butun O'RNATMAGA tegishli, filialga emas - ya'ni filial o'lchovi
  // yo'q va bo'lishi ham shart emas.
  entitlementCache: SCOPE.INFRA,
  refreshToken: SCOPE.INFRA,
  // Fayl kvotasi butun markazga umumiy - shuning uchun uni boshqarish
  // ham owner'da (permissionScope.js: storage.manage).
  storageUsage: SCOPE.INFRA,
  storedFile: SCOPE.INFRA,
});

/** Modelga to'g'ridan-to'g'ri `branchId` maydoni kerakmi. */
export const requiresBranchField = (name) => RESOURCE_SCOPE[name] === SCOPE.BRANCH;

/** Filtrlanishi SHART bo'lgan modellar (global va infra bundan mustasno). */
export const SCOPED_RESOURCES = Object.freeze(
  Object.entries(RESOURCE_SCOPE)
    .filter(([, scope]) => scope !== SCOPE.GLOBAL && scope !== SCOPE.INFRA)
    .map(([name]) => name),
);
