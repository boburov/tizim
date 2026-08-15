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
  // branchId YO'Q, GURUH orqali bog'lanadi -> branchGroupFilter()
  VIA_GROUP: "via-group",
  // branchId YO'Q, FOYDALANUVCHI orqali bog'lanadi -> branchUserFilter()
  VIA_USER: "via-user",
  // branchId YO'Q, IKKI yo'ldan biri bilan (guruh YOKI foydalanuvchi)
  VIA_GROUP_OR_USER: "via-group-or-user",
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
  openingBalance: SCOPE.BRANCH,
  // XONA - filialning FIZIK resursi (Faza 3). Kursdan farqli ravishda
  // filialga bog'langan: "3-xona" har filialda boshqa xona.
  room: SCOPE.BRANCH,
  paymentTransaction: SCOPE.BRANCH,
  salaryTransaction: SCOPE.BRANCH,
  staffCompensation: SCOPE.BRANCH,
  staffPayroll: SCOPE.BRANCH,
  staffPayrollAdjustment: SCOPE.BRANCH,
  staffSalaryTransaction: SCOPE.BRANCH,
  studentPayment: SCOPE.BRANCH,
  teacherCompensation: SCOPE.BRANCH,
  teacherSalary: SCOPE.BRANCH,
  // Foydalanuvchi ALOHIDA shaklda: homeBranchId + branchAssignments[].
  // Shuning uchun uning filtri userBranchCondition() (branchFilter emas).
  user: SCOPE.VIA_USER,

  // ── FILIAL ISTISNOSI (branchId bor, null = butun tarmoq) ──
  // NARX MATRITSASI: branchId = null -> bazaviy narx, branchId = <id> ->
  // shu filial uchun istisno. branchFilter() bilan kesilsa bazaviy qator
  // yo'qolib, filialda narx umuman topilmasdi (coursePrice.service.js).
  coursePrice: SCOPE.BRANCH_OPTIONAL,

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

  // ── INFRATUZILMA (filial o'lchovi ma'nosiz) ──
  botLock: SCOPE.INFRA,
  botUser: SCOPE.INFRA,
  cache: SCOPE.INFRA,
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
