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

  // AI maslahatchi
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

  // O'quvchi depoziti (garov)
  deposits: {
    all: () => ["deposits"],
    studentSummary: (sid) => ["deposits", "studentSummary", sid],
    studentHistory: (sid) => ["deposits", "studentHistory", sid],
    transactions: (params) => ["deposits", "transactions", params],
    report: (params) => ["deposits", "report", params],
  },

  // Moliyaviy hisob-kitob (umumiy hisobotlar)
  financeReport: {
    all: () => ["financeReport"],
    summary: (params) => ["financeReport", "summary", params],
    trend: (params) => ["financeReport", "trend", params],
    groupBreakdown: (params) => ["financeReport", "groupBreakdown", params],
    ledger: (params) => ["financeReport", "ledger", params],
    writeOffs: (params) => ["financeReport", "writeOffs", params],
  },

  // Teacher salary (O'qituvchi maoshlari)
  teacherSalary: {
    all: () => ["teacherSalary"],
    salaries: (params) => ["teacherSalary", "salaries", params],
    salary: (id) => ["teacherSalary", "salary", id],
    teacherHistory: (teacherId) => ["teacherSalary", "teacherHistory", teacherId],
    myFinance: () => ["teacherSalary", "me", "finance"],
    obligations: (params) => ["teacherSalary", "obligations", params],
    report: (params) => ["teacherSalary", "report", params],
  },
});
