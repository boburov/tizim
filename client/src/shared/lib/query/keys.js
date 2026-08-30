// Central registry of TanStack Query keys - extend here when adding a feature
export const qk = Object.freeze({
  auth: {
    me: () => ["auth", "me"],
  },
  search: {
    global: (term) => ["search", "global", term],
  },
  branches: {
    all: () => ["branches"],
    list: (params) => ["branches", "list", params],
    one: (id) => ["branches", "detail", id],
    stats: (id) => ["branches", "stats", id],
    compare: () => ["branches", "compare"],
    delegationOptions: () => ["branches", "delegationOptions"],
  },
  courses: {
    all: () => ["courses"],
    list: (params) => ["courses", "list", params],
    one: (id) => ["courses", "detail", id],
    prices: (id) => ["courses", "prices", id],
  },
  rooms: {
    all: () => ["rooms"],
    list: (params) => ["rooms", "list", params],
    one: (id) => ["rooms", "detail", id],
  },
  journal: {
    all: () => ["journal"],
    balances: (params) => ["journal", "balances", params],
    reconcile: () => ["journal", "reconcile"],
    shifts: (params) => ["journal", "shifts", params],
    transfers: (params) => ["journal", "transfers", params],
  },
  branchAnalytics: {
    all: () => ["branchAnalytics"],
    pnl: (params) => ["branchAnalytics", "pnl", params],
    normalized: (params) => ["branchAnalytics", "normalized", params],
    utilization: () => ["branchAnalytics", "utilization"],
    // Xona bandligi: filial va ish vaqti oynasi kalitning bir qismi —
    // boshqa oyna BOSHQA raqam beradi, ya'ni keshda ham boshqa yozuv.
    roomUtilization: (params) => ["branchAnalytics", "roomUtilization", params],
    churn: (params) => ["branchAnalytics", "churn", params],
    alerts: () => ["branchAnalytics", "alerts"],
    // Filiallar kesimi: sotuv voronkasi va o'qituvchi resursi.
    sales: (params) => ["branchAnalytics", "sales", params],
    teachers: (params) => ["branchAnalytics", "teachers", params],
  },
  // CHIQIMLAR — ro'yxat, tafsilot va kategoriya lug'ati.
  expenses: {
    all: () => ["expenses"],
    lists: () => ["expenses", "list"],
    list: (params) => ["expenses", "list", params],
    one: (id) => ["expenses", "detail", id],
    summary: (params) => ["expenses", "summary", params],
    categories: (params) => ["expenses", "categories", params],
  },
  expenseApprovals: {
    all: () => ["expenseApprovals"],
    list: (params) => ["expenseApprovals", "list", params],
    one: (id) => ["expenseApprovals", "detail", id],
    pendingCount: () => ["expenseApprovals", "pendingCount"],
    stats: () => ["expenseApprovals", "stats"],
  },
  users: {
    all: () => ["users"],
    // Faqat ro'yxat querylari prefiksi (detail/password/history'ni qamramaydi).
    lists: () => ["users", "list"],
    list: (params) => ["users", "list", params],
    one: (id) => ["users", "detail", id],
    password: (id) => ["users", "password", id],
    // "users" prefiksi ATAYLAB: har qanday foydalanuvchi mutatsiyasi
    // qk.users.all() ni invalidatsiya qiladi va kartochkalar ham yangilanadi.
    staffStats: () => ["users", "staff-stats"],
    // Telefon/login bandligi. Kalitga parametrlar kiradi - har raqam
    // uchun javob alohida keshlanadi va bir xil raqam qayta so'ralmaydi.
    availability: (params) => ["users", "availability", params],
    groupHistory: (id, params) => ["users", id, "group-history", params],
  },
  roles: {
    all: () => ["roles"],
    list: () => ["roles", "list"],
    one: (value) => ["roles", "detail", value],
    // Ruxsatlar matritsasi (module x action) - kamdan-kam o'zgaradi.
    matrix: () => ["roles", "matrix"],
  },
  studentFreezes: {
    all: () => ["studentFreezes"],
    byStudent: (id) => ["studentFreezes", id],
  },
  activityHistory: {
    student: (id, params) => ["activityHistory", "student", id, params],
    group: (id, params) => ["activityHistory", "group", id, params],
  },
  archiveReasons: {
    all: () => ["archiveReasons"],
    list: (params) => ["archiveReasons", "list", params],
    report: (params) => ["archiveReasons", "report", params],
  },
  leads: {
    all: () => ["leads"],
    list: (params) => ["leads", "list", params],
    one: (id) => ["leads", "detail", id],
    stats: (params) => ["leads", "stats", params],
    assignees: () => ["leads", "assignees"],
    conversion: (params) => ["leads", "conversion", params],
    routing: () => ["leads", "routing"],
  },
  leadOptions: {
    all: () => ["leadOptions"],
    list: (params) => ["leadOptions", "list", params],
  },
  students: {
    all: () => ["students"],
    list: (params) => ["students", "list", params],
    one: (id) => ["students", "detail", id],
  },
  teachers: {
    all: () => ["teachers"],
    list: (params) => ["teachers", "list", params],
    one: (id) => ["teachers", "detail", id],
  },
  classes: {
    all: () => ["classes"],
    list: (params) => ["classes", "list", params],
    one: (id) => ["classes", "detail", id],
  },
  groups: {
    all: () => ["groups"],
    // Faqat ro'yxat querylari prefiksi (detail/history/teacherPeriods'ni qamramaydi).
    lists: () => ["groups", "list"],
    list: (params) => ["groups", "list", params],
    one: (id) => ["groups", "detail", id],
    history: (id, params) => ["groups", id, "history", params],
    teacherPeriods: (id) => ["groups", id, "teacherPeriods"],
    availableTeachers: (id) => ["groups", id, "availableTeachers"],
    memberships: (id, sid) => ["groups", id, "memberships", sid],
    myActive: () => ["groups", "me", "active"],
    myTeach: () => ["groups", "me", "teach"],
  },

  // Attendance subsystem
  attendance: {
    all: () => ["attendance"],
    byGroupDate: (gid, date, slot = "") => [
      "attendance",
      "groupDate",
      gid,
      date,
      slot,
    ],
    studentMonthly: (sid, params) => ["attendance", "studentMonthly", sid, params],
    studentYearly: (sid, params) => ["attendance", "studentYearly", sid, params],
    studentSummary: (sid, params) => ["attendance", "studentSummary", sid, params],
    groupSummary: (gid, params) => ["attendance", "groupSummary", gid, params],
    groupMonthly: (gid, params) => ["attendance", "groupMonthly", gid, params],
    teacher: (gid, date) => ["attendance", "teacher", gid, date],
    teacherSummary: (params) => ["attendance", "teacherSummary", params],
    dashboard: (params) => ["attendance", "dashboard", params],
  },
  grades: {
    all: () => ["grades"],
    byGroupDate: (gid, date, slot = "") => ["grades", "groupDate", gid, date, slot],
    groupSummary: (gid, params) => ["grades", "groupSummary", gid, params],
    studentSummary: (sid, params) => ["grades", "studentSummary", sid, params],
  },
  rating: {
    all: () => ["rating"],
    leaderboard: (params) => ["rating", "leaderboard", params],
    settings: () => ["rating", "settings"],
    studentRank: (sid, params) => ["rating", "studentRank", sid, params],
  },
  teacherAttendance: {
    all: () => ["teacherAttendance"],
    byDate: (date) => ["teacherAttendance", "date", date],
  },
  attendanceExemptions: {
    all: () => ["attendanceExemptions"],
    byStudent: (studentId) => ["attendanceExemptions", "byStudent", studentId],
    one: (id) => ["attendanceExemptions", "detail", id],
  },
  attendanceSettings: {
    one: () => ["attendanceSettings"],
  },

  // Notifications + Feedback (Bo'lak 7)
  notifications: {
    all: () => ["notifications"],
    list: (params) => ["notifications", "list", params],
    one: (id) => ["notifications", "detail", id],
    recipients: (id, params) => ["notifications", id, "recipients", params],
    preview: (audience) => ["notifications", "preview", audience],
    inbox: (params) => ["notifications", "inbox", params],
    unreadCount: () => ["notifications", "inbox", "unreadCount"],
  },
  // Vazifalar (matn + fayl)
  assignments: {
    all: () => ["assignments"],
    list: (params) => ["assignments", "list", params],
    one: (id) => ["assignments", "detail", id],
    recipients: (id, params) => ["assignments", id, "recipients", params],
    preview: (groupIds) => ["assignments", "preview", groupIds],
    my: (params) => ["assignments", "my", params],
    myUnreadCount: () => ["assignments", "my", "unreadCount"],
  },

  // Fayl saqlash kvotasi
  storage: {
    all: () => ["storage"],
    usage: () => ["storage", "usage"],
    settings: () => ["storage", "settings"],
    files: (params) => ["storage", "files", params],
  },

  systemNotifications: {
    all: () => ["systemNotifications"],
    list: (params) => ["systemNotifications", "list", params],
    unreadCount: () => ["systemNotifications", "unreadCount"],
  },
  notificationTemplates: {
    all: () => ["notificationTemplates"],
    list: (params) => ["notificationTemplates", "list", params],
    one: (id) => ["notificationTemplates", "detail", id],
  },
  holidays: {
    all: () => ["holidays"],
    list: (params) => ["holidays", "list", params],
    one: (id) => ["holidays", "detail", id],
    teacherBirthdays: () => ["holidays", "teacherBirthdays"],
  },
  feedback: {
    all: () => ["feedback"],
    list: (params) => ["feedback", "list", params],
    one: (id) => ["feedback", "detail", id],
    me: (params) => ["feedback", "me", params],
    stats: (params) => ["feedback", "stats", params],
  },
  feedbackTypes: {
    all: () => ["feedbackTypes"],
    list: (params) => ["feedbackTypes", "list", params],
    one: (id) => ["feedbackTypes", "detail", id],
  },

  // Boshqaruv paneli (Bo'lak 9)
  activityLogs: {
    all: () => ["activityLogs"],
    list: (params) => ["activityLogs", "list", params],
    one: (id) => ["activityLogs", "detail", id],
    stats: (params) => ["activityLogs", "stats", params],
  },
  adminDashboard: {
    overview: (params) => ["adminDashboard", "overview", params],
    studentFlow: (params) => ["adminDashboard", "studentFlow", params],
    cashflow: (params) => ["adminDashboard", "cashflow", params],
    studentStats: (params) => ["adminDashboard", "studentStats", params],
    retention: (params) => ["adminDashboard", "retention", params],
    churnedStudents: (params) => ["adminDashboard", "churnedStudents", params],
  },

  // Tahlil markazi (ichki nom: ai)
  ai: {
    all: () => ["ai"],
    // Barcha insight ro'yxatlari prefiksi - mutatsiyadan keyin shuni
    // invalidate qilish yetarli (actionCenter ham shu prefiks ostida).
    insights: () => ["ai", "insights"],
    list: (params) => ["ai", "insights", "list", params],
    actionCenter: (params) => ["ai", "insights", "actionCenter", params],
    // Modul paneli: "Moliya → AI Insights". `insights` prefiksi ostida -
    // insight mutatsiyasidan keyin panellar ham yangilanadi.
    byDomain: (domain, params) => ["ai", "insights", "domain", domain, params],
    // Ro'yxat sahifasidagi badge'lar: N ta subyekt uchun BITTA so'rov.
    bySubjects: (ids) => ["ai", "insights", "bySubjects", ids],

    // Brifing insight'larga tayanadi (u "hozir nima qilay" bo'limini
    // ulardan quradi), shuning uchun u ham `insights` prefiksi ostida:
    // vazifa bajarilgach dashboard o'zi yangilanadi.
    briefing: (params) => ["ai", "insights", "briefing", params],

    // Hisobotlar ALOHIDA prefiks: ular o'tmish snapshot'lari va insight
    // mutatsiyasi ularni o'zgartirmaydi - keraksiz refetch qilmasin.
    reports: () => ["ai", "reports"],
    reportList: (params) => ["ai", "reports", "list", params],
    report: (id) => ["ai", "reports", "detail", id],
    latestReport: (period) => ["ai", "reports", "latest", period ?? "daily"],

    // Reytinglar ("eng ko'p kechiktirganlar / qoldirganlar / o'qituvchilar").
    //
    // `insights` prefiksi ostida EMAS: reyting insight mutatsiyasidan
    // (ko'rdim/bajarildi) o'zgarmaydi - u tungi snapshotdan o'qiladi.
    // Insight prefiksiga qo'shsak har "Bajarildi" bosilganda uchala
    // reyting bekordan-bekor qayta so'ralardi.
    rankings: () => ["ai", "rankings"],

    config: (branchId) => ["ai", "config", branchId ?? null],
  },

  // Excel eksport. Faqat reyestr (dataset'lar + ustunlar) keshlanadi -
  // yuklab olishning o'zi mutatsiya, uning keshi yo'q.
  exports: {
    all: () => ["exports"],
    datasets: () => ["exports", "datasets"],
  },

  // Excel import. Ko'rib chiqish/tasdiqlash - mutatsiya, keshlanmaydi.
  imports: {
    all: () => ["imports"],
    importers: () => ["imports", "importers"],
    options: (key) => ["imports", "options", key],
    history: (params) => ["imports", "history", params],
    // Fondagi importning holati - jarayon tugagunicha so'rab turiladi.
    job: (jobId) => ["imports", "job", jobId],
  },

  // Finance (Moliya)
  finance: {
    all: () => ["finance"],
    groupFees: (params) => ["finance", "groupFees", params],
    groupFeesByGroup: (gid) => ["finance", "groupFees", "group", gid],
    studentPayments: (params) => ["finance", "studentPayments", params],
    studentObligations: (params) => ["finance", "studentObligations", params],
    studentPayment: (id) => ["finance", "studentPayment", id],
    studentHistory: (studentId) => ["finance", "studentHistory", studentId],
    discounts: (params) => ["finance", "discounts", params],
    report: (params) => ["finance", "report", params],
  },

  // SHAXSIY MOLIYAVIY TARIX (ledger).
  //
  // Bu MANBA hujjatlardan qayta hisoblanadi (to'lov, maosh, depozit,
  // boshlang'ich qoldiq), shuning uchun har qanday moliyaviy mutatsiya
  // uni ham eskirtiradi. Prefiksi ATAYLAB alohida ("ledger") - u
  // birdaniga bir necha modulga tegishli va ularning birortasining
  // ostiga qo'yish "nega to'lov o'zgarganda maosh keshi tozalandi?"
  // degan chalkashlik tug'dirardi.
  ledger: {
    all: () => ["ledger"],
    statement: (userId) => ["ledger", "statement", userId],
    my: () => ["ledger", "me"],
  },

  openingBalance: {
    all: () => ["openingBalance"],
    list: (params) => ["openingBalance", "list", params],
  },

  // O'quvchi depoziti (garov)
  deposits: {
    all: () => ["deposits"],
    studentSummary: (sid) => ["deposits", "studentSummary", sid],
    studentHistory: (sid) => ["deposits", "studentHistory", sid],
    transactions: (params) => ["deposits", "transactions", params],
    report: (params) => ["deposits", "report", params],
  },

  // Moliyaviy hisob-kitob (umumiy hisobotlar)
  // MOLIYA TAHLILI. Kalitga FILTR to'liq kiradi — davr yoki filial
  // o'zgarganda react-query yangi so'rov yuborishi kerak.
  financeAnalytics: {
    all: () => ["financeAnalytics"],
    summary: (f) => ["financeAnalytics", "summary", f],
    alerts: (f) => ["financeAnalytics", "alerts", f],
    revenueTrend: (f) => ["financeAnalytics", "revenueTrend", f],
    revenueBy: (by, f) => ["financeAnalytics", "revenueBy", by, f],
    paymentMethods: (f) => ["financeAnalytics", "paymentMethods", f],
    refunds: (f) => ["financeAnalytics", "refunds", f],
    discounts: (f) => ["financeAnalytics", "discounts", f],
    expenseTrend: (f) => ["financeAnalytics", "expenseTrend", f],
    expenseBreakdown: (f) => ["financeAnalytics", "expenseBreakdown", f],
    costStructure: (f) => ["financeAnalytics", "costStructure", f],
    recurring: (f) => ["financeAnalytics", "recurring", f],
    budget: (f) => ["financeAnalytics", "budget", f],
    cashFlow: (f) => ["financeAnalytics", "cashFlow", f],
    accounts: (f) => ["financeAnalytics", "accounts", f],
    cashTrend: (f) => ["financeAnalytics", "cashTrend", f],
    receivables: (f) => ["financeAnalytics", "receivables", f],
    receivablesBy: (by, f) => ["financeAnalytics", "receivablesBy", by, f],
    teachers: (f) => ["financeAnalytics", "teachers", f],
    directions: (f) => ["financeAnalytics", "directions", f],
    groups: (f) => ["financeAnalytics", "groups", f],
    rooms: (f) => ["financeAnalytics", "rooms", f],
    branches: (f) => ["financeAnalytics", "branches", f],
    branchOverview: (f) => ["financeAnalytics", "branchOverview", f],
    intelligence: (f) => ["financeAnalytics", "intelligence", f],
    briefing: (f) => ["financeAnalytics", "briefing", f],
    signal: (id, f, explain) => ["financeAnalytics", "signal", id, f, explain],
    expenseBy: (by, f) => ["financeAnalytics", "expenseBy", by, f],
    studentFinance: (id, f) => ["financeAnalytics", "studentFinance", id, f],
    entries: (f) => ["financeAnalytics", "entries", f],
    entry: (id) => ["financeAnalytics", "entry", id],
    entryByKey: (key) => ["financeAnalytics", "entryByKey", key],
    budgets: (f) => ["financeAnalytics", "budgets", f],
    budgetOne: (id) => ["financeAnalytics", "budgetOne", id],
  },

  financeReport: {
    all: () => ["financeReport"],
    summary: (params) => ["financeReport", "summary", params],
    trend: (params) => ["financeReport", "trend", params],
    groupBreakdown: (params) => ["financeReport", "groupBreakdown", params],
    ledger: (params) => ["financeReport", "ledger", params],
    writeOffs: (params) => ["financeReport", "writeOffs", params],
  },

  // Xodimlar maoshi + KPI
  staffPayroll: {
    all: () => ["staffPayroll"],
    list: (params) => ["staffPayroll", "list", params],
    one: (id) => ["staffPayroll", "one", id],
    byEmployee: (employeeId) => ["staffPayroll", "employee", employeeId],
    compensations: (employeeId) => ["staffPayroll", "compensations", employeeId],
    compensationsMissing: () => ["staffPayroll", "compensations", "missing"],
    rules: (params) => ["staffPayroll", "rules", params],
    triggers: () => ["staffPayroll", "triggers"],
    assignments: (employeeId) => ["staffPayroll", "assignments", employeeId],
    impact: (employeeId) => ["staffPayroll", "impact", employeeId],
    timeline: (employeeId) => ["staffPayroll", "timeline", employeeId],
  },

  // Teacher salary (O'qituvchi maoshlari)
  teacherSalary: {
    all: () => ["teacherSalary"],
    salaries: (params) => ["teacherSalary", "salaries", params],
    salary: (id) => ["teacherSalary", "salary", id],
    teacherHistory: (teacherId) => ["teacherSalary", "teacherHistory", teacherId],
    // Joriy maosh holati (fiksa, jami daromad, qoldiqlar). `teacherSalary`
    // prefiksi ostida - to'lov/stavka mutatsiyasi buni ham yangilaydi.
    teacherBalance: (teacherId) => ["teacherSalary", "teacherBalance", teacherId],
    myFinance: () => ["teacherSalary", "me", "finance"],
    obligations: (params) => ["teacherSalary", "obligations", params],
    report: (params) => ["teacherSalary", "report", params],
    // O'qituvchi standart maosh stavkasi (tarix + amaldagisi).
    compensations: (teacherId) => ["teacherSalary", "compensations", teacherId],
  },

  // ── TANGALAR ──
  //
  // `config` ALOHIDA ILDIZDA (`coinConfig`), `coins` ostida EMAS.
  // Sabab: xarid qilinganda `qk.coins.all()` bekor qilinadi (balans
  // o'zgardi), lekin o'chirgich holati o'zgarmagan — uni ham qayta
  // so'rash har xaridda ortiqcha so'rov tug'dirardi. Sozlama esa
  // aksincha: o'chirgich bosilganda IKKALASI ham bekor qilinadi.
  coinConfig: {
    all: () => ["coinConfig"],
  },
  // Tarif imkoniyatlari. ALOHIDA ILDIZ: dev panelda modul yoqilganda
  // faqat shu kalit bekor qilinadi, butun kesh emas.
  features: {
    all: () => ["features"],
  },
  coins: {
    all: () => ["coins"],
    me: () => ["coins", "me"],
    myHistory: (params) => ["coins", "me", "history", params],
    leaderboard: (params) => ["coins", "leaderboard", params],
    // ⚠ `days` kalitning bir qismi — sabab `useCoinStatsQuery` izohida.
    stats: (days) => ["coins", "stats", days],
    settings: () => ["coins", "settings"],
    userWallet: (userId, params) => ["coins", "wallet", userId, params],
  },

  // ── MARKET ──
  market: {
    all: () => ["market"],
    catalog: (params) => ["market", "catalog", params],
    products: (params) => ["market", "products", params],
    product: (id) => ["market", "product", id],
    orders: (params) => ["market", "orders", params],
    order: (id) => ["market", "order", id],
    myOrders: (params) => ["market", "myOrders", params],
  },
});
