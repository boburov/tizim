export const ENDPOINTS = Object.freeze({
  auth: {
    login: "/auth/login",
    logout: "/auth/logout",
    refresh: "/auth/refresh",
    me: "/auth/me",
    updateMe: "/auth/me",
    changePassword: "/auth/change-password",
    registerUser: "/auth/register-user",
  },
  branches: {
    base: "/branches",
    byId: (id) => `/branches/${id}`,
    stats: (id) => `/branches/${id}/stats`,
    compare: "/branches/compare",
    // Delegatsiya katalogi: qaysi sozlama turiga qaysi rejim mumkin.
    // Serverdan olinadi - ro'yxat xavfsizlik qoidasi (maosh turlarida
    // `auto` yo'q) va client bilan ajralib ketmasligi kerak.
    delegationOptions: "/branches/delegation-options",
  },

  // KURS KATALOGI (global) + filial narx matritsasi.
  courses: {
    base: "/courses",
    byId: (id) => `/courses/${id}`,
    prices: (id) => `/courses/${id}/prices`,
    clearPrice: (id, branchId) => `/courses/${id}/prices/${branchId}`,
    resolve: (groupId) => `/courses/resolve/${groupId}`,
  },

  // XONALAR - filialning fizik resursi.
  rooms: {
    base: "/rooms",
    byId: (id) => `/rooms/${id}`,
  },

  // KASSA - qo'sh yozuv jurnali. DIQQAT: /ledger dan BOSHQA narsa
  // (u shaxsiy hisobvaraq).
  journal: {
    balances: "/journal/balances",
    reconcile: "/journal/reconcile",
    shifts: "/journal/shifts",
    shiftClose: (id) => `/journal/shifts/${id}/close`,
    transfers: "/journal/transfers",
    transferReceive: (id) => `/journal/transfers/${id}/receive`,
    transferCancel: (id) => `/journal/transfers/${id}/cancel`,
  },

  // FILIAL TAHLILI - P&L, normalizatsiya, bandlik, churn, alertlar.
  branchAnalytics: {
    pnl: "/branch-analytics/pnl",
    elimination: "/branch-analytics/elimination",
    utilization: "/branch-analytics/utilization",
    churn: "/branch-analytics/churn",
    normalized: "/branch-analytics/normalized",
    alerts: "/branch-analytics/alerts",
    transferPreview: (id) => `/branch-analytics/students/${id}/transfer-preview`,
    transfer: (id) => `/branch-analytics/students/${id}/transfer`,
  },
  expenseApprovals: {
    base: "/expense-approvals",
    byId: (id) => `/expense-approvals/${id}`,
    pendingCount: "/expense-approvals/pending-count",
    stats: "/expense-approvals/stats",
    approve: (id) => `/expense-approvals/${id}/approve`,
    reject: (id) => `/expense-approvals/${id}/reject`,
    cancel: (id) => `/expense-approvals/${id}/cancel`,
    retry: (id) => `/expense-approvals/${id}/retry`,
    bulkApprove: "/expense-approvals/bulk-approve",
    bulkReject: "/expense-approvals/bulk-reject",
  },
  users: {
    base: "/users",
    byId: (id) => `/users/${id}`,
    password: (id) => `/users/${id}/password`,
    groupHistory: (id) => `/users/${id}/group-history`,
    role: (id) => `/users/${id}/role`,
    staff: "/users/staff",
    // Xodimlar statistikasi (rol kesimida) - kartochkalar uchun.
    staffStats: "/users/staff-stats",
    // Telefon/login bandligini formani yuborishdan OLDIN tekshirish.
    checkAvailability: "/users/check-availability",
    branches: (id) => `/users/${id}/branches`,
  },
  roles: {
    base: "/roles",
    // Tizimda MAVJUD ruxsatlardan qurilgan module x action jadvali.
    matrix: "/roles/matrix",
    byValue: (value) => `/roles/${value}`,
    freeze: (value) => `/roles/${value}/freeze`,
  },
  studentFreezes: {
    byStudent: (sid) => `/student-freezes/${sid}`,
    freeze: (sid) => `/student-freezes/${sid}/freeze`,
    unfreeze: (sid) => `/student-freezes/${sid}/unfreeze`,
  },
  activityHistory: {
    student: (sid) => `/activity-history/students/${sid}`,
    group: (gid) => `/activity-history/groups/${gid}`,
  },
  archiveReasons: {
    base: "/archive-reasons",
    byId: (id) => `/archive-reasons/${id}`,
    report: "/archive-reasons/report",
  },
  leads: {
    base: "/leads",
    byId: (id) => `/leads/${id}`,
    convert: (id) => `/leads/${id}/convert`,
    convertBulk: "/leads/convert-bulk",
    reminder: (id) => `/leads/${id}/reminder`,
    reminderBulk: "/leads/reminder-bulk",
    stats: "/leads/stats",
    // Lidga biriktiriladigan xodimlar. /users EMAS: u `users.read`
    // talab qiladi va resepshinda bu ruxsat yo'q.
    assignees: "/leads/assignees",
    // Konversiya taqqoslash: filial va xodim kesimida.
    conversion: "/leads/conversion",
    // Yo'naltirish qoidalari - qaysi manbadan kelgan lid qaysi filialga.
    routing: "/leads/routing",
    routingById: (id) => `/leads/routing/${id}`,
  },
  leadOptions: {
    base: "/lead-options",
    byId: (id) => `/lead-options/${id}`,
  },
  students: {
    base: "/students",
    byId: (id) => `/students/${id}`,
  },
  teachers: {
    base: "/teachers",
    byId: (id) => `/teachers/${id}`,
  },
  classes: {
    base: "/classes",
    byId: (id) => `/classes/${id}`,
  },
  groups: {
    base: "/groups",
    byId: (id) => `/groups/${id}`,
    students: (id) => `/groups/${id}/students`,
    studentsBulk: (id) => `/groups/${id}/students/bulk`,
    studentById: (id, sid) => `/groups/${id}/students/${sid}`,
    studentMemberships: (id, sid) => `/groups/${id}/students/${sid}/memberships`,
    membershipById: (id, mid) => `/groups/${id}/memberships/${mid}`,
    history: (id) => `/groups/${id}/history`,
    myActive: "/groups/me/active",
    myTeach: "/groups/me/teach",
    removalNoticeSeen: "/groups/me/removal-notice/seen",
    availableTeachers: (id) => `/groups/${id}/available-teachers`,
    teacherPeriods: (id) => `/groups/${id}/teacher-periods`,
    teacherPeriodById: (id, pid) => `/groups/${id}/teacher-periods/${pid}`,
  },


  // Attendance subsystem
  attendance: {
    base: "/attendance",
    groupOnDate: (gid) => `/attendance/groups/${gid}`,
    bulk: (gid) => `/attendance/groups/${gid}/bulk`,
    studentMonthly: (sid) => `/attendance/students/${sid}/monthly`,
    studentYearly: (sid) => `/attendance/students/${sid}/yearly`,
    studentSummary: (sid) => `/attendance/students/${sid}/summary`,
    groupSummary: (gid) => `/attendance/groups/${gid}/summary`,
    groupMonthly: (gid) => `/attendance/groups/${gid}/monthly`,
    teacher: (gid) => `/attendance/groups/${gid}/teacher`,
    teacherSummary: "/attendance/teacher/me/summary",
    dashboard: "/attendance/dashboard",
  },
  grades: {
    groupOnDate: (gid) => `/grades/groups/${gid}`,
    bulk: (gid) => `/grades/groups/${gid}/bulk`,
    groupSummary: (gid) => `/grades/groups/${gid}/summary`,
    studentSummary: (sid) => `/grades/students/${sid}/summary`,
  },
  rating: {
    leaderboard: "/grades/rating/leaderboard",
    settings: "/grades/rating/settings",
    studentRank: (sid) => `/grades/rating/students/${sid}`,
  },
  teacherAttendance: {
    base: "/teacher-attendance",
    bulk: "/teacher-attendance/bulk",
  },
  attendanceExemptions: {
    base: "/attendance-exemptions",
    byId: (id) => `/attendance-exemptions/${id}`,
  },
  attendanceSettings: {
    base: "/attendance-settings",
  },

  // Notifications + Feedback (Bo'lak 7)
  notifications: {
    base: "/notifications",
    byId: (id) => `/notifications/${id}`,
    recipients: (id) => `/notifications/${id}/recipients`,
    preview: "/notifications/preview",
    cancel: (id) => `/notifications/${id}/cancel`,
    inbox: "/notifications/inbox",
    unreadCount: "/notifications/inbox/unread-count",
    markRead: (id) => `/notifications/inbox/${id}/read`,
    markAllRead: "/notifications/inbox/read-all",
  },
  // Tizim bildirishnomalari (, owner)
  systemNotifications: {
    base: "/system-notifications",
    unreadCount: "/system-notifications/unread-count",
    markRead: (id) => `/system-notifications/${id}/read`,
    markAllRead: "/system-notifications/read-all",
  },
  notificationTemplates: {
    base: "/notification-templates",
    byId: (id) => `/notification-templates/${id}`,
  },
  holidays: {
    base: "/holidays",
    byId: (id) => `/holidays/${id}`,
    teacherBirthdays: "/holidays/teacher-birthdays",
    congratulate: (id) => `/holidays/teacher-birthdays/${id}/congratulate`,
  },
  feedback: {
    base: "/feedback",
    byId: (id) => `/feedback/${id}`,
    me: "/feedback/me",
    stats: "/feedback/stats",
    review: (id) => `/feedback/${id}/review`,
    reply: (id) => `/feedback/${id}/reply`,
    resolve: (id) => `/feedback/${id}/resolve`,
    reject: (id) => `/feedback/${id}/reject`,
  },
  feedbackTypes: {
    base: "/feedback-types",
    byId: (id) => `/feedback-types/${id}`,
  },

  // Admin dashboard / Activity logs (Bo'lak 9)
  activityLogs: {
    base: "/activity-logs",
    byId: (id) => `/activity-logs/${id}`,
    stats: "/activity-logs/stats",
  },
  adminDashboard: {
    overview: "/admin-dashboard/overview",
    studentFlow: "/admin-dashboard/student-flow",
    cashflow: "/admin-dashboard/cashflow",
    studentStats: "/admin-dashboard/student-stats",
    retention: "/admin-dashboard/retention",
    churnedStudents: "/admin-dashboard/churned-students",
  },

  // Vazifalar (matn + fayl, guruh o'quvchilariga bot orqali)
  assignments: {
    base: "/assignments",
    byId: (id) => `/assignments/${id}`,
    preview: "/assignments/preview",
    recipients: (id) => `/assignments/${id}/recipients`,
    file: (id) => `/assignments/${id}/file`,
    my: "/assignments/my",
    myUnreadCount: "/assignments/my/unread-count",
    markRead: (id) => `/assignments/my/${id}/read`,
  },

  // Fayl saqlash kvotasi (sidebar indikatori)
  storage: {
    usage: "/storage/usage",
    settings: "/storage/settings",
    cleanupPreview: "/storage/cleanup/preview",
    cleanup: "/storage/cleanup",
    files: "/storage/files",
    fileById: (id) => `/storage/files/${id}`,
  },

  // Excel eksport. Ustunlar ro'yxati SERVERDAN olinadi (datasets) -
  // client'da qattiq yozilmaydi, aks holda ikkalasi bir-biridan uzoqlashadi.
  exports: {
    datasets: "/exports/datasets",
    download: (datasetKey) => `/exports/${datasetKey}`,
  },

  // Excel import. Ustun tavsifi ham serverdan keladi (importers).
  imports: {
    importers: "/imports/importers",
    history: "/imports/history",
    template: (key) => `/imports/${key}/template`,
    // Tanlov (select) ustunlari uchun variantlar: guruh, filial, rol.
    options: (key) => `/imports/${key}/options`,
    preview: (key) => `/imports/${key}/preview`,
    commit: (key) => `/imports/${key}/commit`,
    errorReport: (key) => `/imports/${key}/error-report`,
    // JADVAL OQIMI: fayl → tahrirlanadigan jadval → yaratish.
    // Eski preview/commit dan farqi - tasdiqda FAYL emas, tahrirlangan
    // QATORLAR yuboriladi (server ularni baribir qayta tekshiradi).
    draft: (key) => `/imports/${key}/draft`,
    validateRows: (key) => `/imports/${key}/validate-rows`,
    create: (key) => `/imports/${key}/create`,
    job: (jobId) => `/imports/jobs/${jobId}`,
  },

  // Finance (Moliya)
  finance: {
    groupFees: "/finance/group-fees",
    groupFeesByGroup: (gid) => `/finance/group-fees/group/${gid}`,
    studentPayments: "/finance/student-payments",
    studentObligations: "/finance/student-payments/obligations",
    studentPaymentById: (id) => `/finance/student-payments/${id}`,
    studentPaymentHistory: (studentId) =>
      `/finance/student-payments/by-student/${studentId}`,
    transactions: "/finance/transactions",
    transactionById: (id) => `/finance/transactions/${id}`,
    discounts: "/finance/discounts",
    discountById: (id) => `/finance/discounts/${id}`,
  },

  // SHAXSIY MOLIYAVIY TARIX (ledger) - boshlang'ich qoldiq →
  // tranzaksiyalar → joriy balans. Faqat o'qiydi.
  ledger: {
    statement: (userId) => `/ledger/${userId}`,
    my: "/ledger/me",
  },

  // BOSHLANG'ICH QOLDIQ (tizimga o'tishdan oldingi hisob-kitob).
  openingBalance: {
    root: "/opening-balance",
    repair: "/opening-balance/repair",
  },

  // O'quvchi depoziti (garov)
  deposits: {
    studentSummary: (sid) => `/deposits/students/${sid}`,
    studentHistory: (sid) => `/deposits/students/${sid}/history`,
    topup: "/deposits/topup",
    withdraw: "/deposits/withdraw",
    apply: "/deposits/apply",
    transactions: "/deposits/transactions",
    transactionById: (id) => `/deposits/transactions/${id}`,
    report: "/deposits/report",
  },

  // Moliyaviy hisob-kitob (umumiy hisobotlar)
  financeReport: {
    summary: "/finance-report/summary",
    trend: "/finance-report/trend",
    groupBreakdown: "/finance-report/group-breakdown",
    ledger: "/finance-report/ledger",
    writeOffs: "/finance-report/write-offs",
  },

  // Teacher salary (O'qituvchi maoshlari)
  // XODIMLAR MAOSHI (o'qituvchi bo'lmaganlar + KPI).
  // teacherSalary'dan ATAYLAB alohida: ikki modul bir-biriga tegmaydi.
  staffPayroll: {
    base: "/staff-payroll",
    byId: (id) => `/staff-payroll/${id}`,
    byEmployee: (employeeId) => `/staff-payroll/by-employee/${employeeId}`,
    generate: "/staff-payroll/generate",
    recompute: (id) => `/staff-payroll/${id}/recompute`,
    lifecycle: (id) => `/staff-payroll/${id}/lifecycle`,

    compensations: "/staff-payroll/compensations",
    compensationById: (id) => `/staff-payroll/compensations/${id}`,
    compensationsByEmployee: (employeeId) =>
      `/staff-payroll/compensations/by-employee/${employeeId}`,
    compensationsMissing: "/staff-payroll/compensations/missing",

    adjustments: "/staff-payroll/adjustments",
    adjustmentById: (id) => `/staff-payroll/adjustments/${id}`,

    transactions: "/staff-payroll/transactions",
    transactionById: (id) => `/staff-payroll/transactions/${id}`,

    kpiTriggers: "/staff-payroll/kpi/triggers",
    kpiRules: "/staff-payroll/kpi/rules",
    kpiRuleById: (id) => `/staff-payroll/kpi/rules/${id}`,
    kpiAssignments: "/staff-payroll/kpi/assignments",
    kpiAssignmentsByEmployee: (employeeId) =>
      `/staff-payroll/kpi/assignments/${employeeId}`,
    kpiAssignmentById: (id) => `/staff-payroll/kpi/assignments/${id}`,

    // HR va moliya chegarasi: ishga olingan sana o'zgarganda nima
    // bo'lishini KO'RSATADI, lekin hech narsani o'zi o'zgartirmaydi.
    historyImpact: (employeeId) => `/staff-payroll/history/impact/${employeeId}`,
    payrollStart: (employeeId) =>
      `/staff-payroll/history/payroll-start/${employeeId}`,
    generateRange: "/staff-payroll/history/generate-range",
    recalculate: "/staff-payroll/history/recalculate",
    lock: "/staff-payroll/history/lock",
    preview: "/staff-payroll/history/preview",
    timeline: (employeeId) => `/staff-payroll/history/timeline/${employeeId}`,
  },

  teacherSalary: {
    salaries: "/teacher-salary/salaries",
    salaryById: (id) => `/teacher-salary/salaries/${id}`,
    salaryHistory: (teacherId) =>
      `/teacher-salary/salaries/by-teacher/${teacherId}`,
    // Joriy holat: fiksa stavka, bu oygi jami daromad, qoldiqlar.
    salaryBalance: (teacherId) =>
      `/teacher-salary/salaries/by-teacher/${teacherId}/balance`,
    myFinance: "/teacher-salary/me/finance",
    obligations: "/teacher-salary/obligations",
    transactions: "/teacher-salary/transactions",
    transactionById: (id) => `/teacher-salary/transactions/${id}`,

    // O'QITUVCHI STANDART MAOSH STAVKASI (markaz darajasida, sana-amalli).
    // Guruh davri (teacher-periods) bu stavkani BEKOR QILISHI mumkin -
    // ya'ni bu "standart", u esa "bu guruhda boshqacha kelishdik".
    compensations: "/teacher-salary/compensations",
    compensationById: (id) => `/teacher-salary/compensations/${id}`,
    compensationsByTeacher: (teacherId) =>
      `/teacher-salary/compensations/by-teacher/${teacherId}`,

    // KPI mukofoti / jarima - alohida maosh qatori.
    adjustments: "/teacher-salary/adjustments",
    adjustmentById: (id) => `/teacher-salary/adjustments/${id}`,
  },
});
