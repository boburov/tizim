import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.js";
import branchesRouter from "../modules/branches/branches.routes.js";
import usersRouter from "../modules/users/users.routes.js";
import rolesRouter from "../modules/roles/roles.routes.js";
import studentFreezeRouter from "../modules/studentFreeze/studentFreeze.routes.js";
import archiveReasonsRouter from "../modules/archiveReasons/archiveReasons.routes.js";
import leadsRouter from "../modules/leads/leads.routes.js";
import leadOptionsRouter from "../modules/leadOptions/leadOptions.routes.js";
import groupsRouter from "../modules/groups/groups.routes.js";
import coursesRouter from "../modules/courses/courses.routes.js";
import roomsRouter from "../modules/rooms/rooms.routes.js";
import journalRouter from "../modules/journal/journal.routes.js";
import branchAnalyticsRouter from "../modules/branchAnalytics/branchAnalytics.routes.js";
import attendanceRouter from "../modules/attendance/attendance.routes.js";
import teacherAttendanceRouter from "../modules/teacherAttendance/teacherAttendance.routes.js";
import attendanceExemptionsRouter from "../modules/attendanceExemptions/attendanceExemptions.routes.js";
import attendanceSettingsRouter from "../modules/attendanceSettings/attendanceSettings.routes.js";
import lessonCancellationsRouter from "../modules/lessonCancellations/lessonCancellations.routes.js";
import gradesRouter from "../modules/grades/grades.routes.js";
import notificationsRouter from "../modules/notifications/notifications.routes.js";
import systemNotificationsRouter from "../modules/systemNotifications/systemNotifications.routes.js";
import notificationTemplatesRouter from "../modules/notificationTemplates/notificationTemplates.routes.js";
import holidaysRouter from "../modules/holidays/holidays.routes.js";
import feedbackRouter from "../modules/feedback/feedback.routes.js";
import feedbackTypesRouter from "../modules/feedbackTypes/feedbackTypes.routes.js";
import botAuthRouter from "../modules/botAuth/botAuth.routes.js";
import activityLogsRouter from "../modules/activityLogs/activityLogs.routes.js";
import activityHistoryRouter from "../modules/activityHistory/activityHistory.routes.js";
import adminDashboardRouter from "../modules/adminDashboard/adminDashboard.routes.js";
import searchRouter from "../modules/search/search.routes.js";
import financeRouter from "../modules/finance/finance.routes.js";
import depositsRouter from "../modules/deposits/deposits.routes.js";
import teacherSalaryRouter from "../modules/teacherSalary/teacherSalary.routes.js";
import staffPayrollRouter from "../modules/staffPayroll/staffPayroll.routes.js";
import expensesRouter from "../modules/expenses/expenses.routes.js";
import financeReportRouter from "../modules/financeReport/financeReport.routes.js";
import ledgerRouter from "../modules/ledger/ledger.routes.js";
import openingBalanceRouter from "../modules/openingBalance/openingBalance.routes.js";
import expenseApprovalsRouter from "../modules/expenseApprovals/expenseApprovals.routes.js";
import aiRouter from "../modules/ai/ai.routes.js";
import exportsRouter from "../modules/exports/exports.routes.js";
import importsRouter from "../modules/imports/imports.routes.js";
import assignmentsRouter from "../modules/assignments/assignments.routes.js";
import storageRouter from "../modules/storage/storage.routes.js";

const router = Router();

router.get("/health", (_req, res) =>
  res.json({ success: true, message: "Server ishlayapti" }),
);

router.use("/auth", authRouter);
router.use("/branches", branchesRouter);
router.use("/search", searchRouter);
router.use("/users", usersRouter);
router.use("/roles", rolesRouter);
router.use("/student-freezes", studentFreezeRouter);
router.use("/archive-reasons", archiveReasonsRouter);
router.use("/leads", leadsRouter);
router.use("/lead-options", leadOptionsRouter);
router.use("/groups", groupsRouter);
// KURS KATALOGI (global) va XONALAR (filial resursi).
// Ikkalasi ham modeli bor-u route'i yo'q holatda turgan edi.
router.use("/courses", coursesRouter);
router.use("/rooms", roomsRouter);
// KASSA - qo'sh yozuv jurnali: qoldiqlar, smena, inkassatsiya.
// DIQQAT: bu /ledger DAN BOSHQA narsa. U yerdagi "ledger" - o'quvchi
// va xodimning SHAXSIY hisobvarag'i (o'qish modeli).
router.use("/journal", journalRouter);
// FILIAL TAHLILI - P&L (elimination bilan), normalizatsiya, bandlik,
// churn va o'quvchini filiallararo ko'chirish.
router.use("/branch-analytics", branchAnalyticsRouter);

// Attendance subsystem
router.use("/attendance", attendanceRouter);
router.use("/teacher-attendance", teacherAttendanceRouter);
router.use("/attendance-exemptions", attendanceExemptionsRouter);
router.use("/attendance-settings", attendanceSettingsRouter);
// Bekor qilingan darslar: o'tmagan dars uchun o'quvchi to'lamaydi va
// o'qituvchining soatbay maoshiga ham sanalmaydi.
router.use("/lesson-cancellations", lessonCancellationsRouter);

// Grading subsystem
router.use("/grades", gradesRouter);

// Communication: Notifications + Feedback
router.use("/notifications", notificationsRouter);
router.use("/system-notifications", systemNotificationsRouter);
router.use("/notification-templates", notificationTemplatesRouter);
router.use("/holidays", holidaysRouter);
router.use("/feedback", feedbackRouter);
router.use("/feedback-types", feedbackTypesRouter);

// Vazifalar (o'qituvchi -> guruh o'quvchilari: matn + fayl, bot orqali).
router.use("/assignments", assignmentsRouter);

// Fayl saqlash kvotasi (sidebar indikatori shu manzildan oziqlanadi).
router.use("/storage", storageRouter);

// Bot mini-app authentication (Telegram WebApp initData)
router.use("/bot-auth", botAuthRouter);

// Admin / boshqaruv paneli
router.use("/activity-logs", activityLogsRouter);
router.use("/activity-history", activityHistoryRouter);
router.use("/admin-dashboard", adminDashboardRouter);

// Finance subsystem (Moliya)
router.use("/finance", financeRouter);
router.use("/deposits", depositsRouter);
router.use("/teacher-salary", teacherSalaryRouter);
// XODIMLAR MAOSHI (o'qituvchi bo'lmaganlar + KPI). ALOHIDA modul:
// o'qituvchi maoshi mantig'iga umuman tegmaydi.
router.use("/staff-payroll", staffPayrollRouter);
// Umumiy chiqimlar (ijara, kommunal, ta'mir, reklama...). Maosh bu yerda EMAS -
// u /teacher-salary da qoladi; hisobot ikkalasini qo'shib ko'rsatadi.
router.use("/expenses", expensesRouter);
router.use("/finance-report", financeReportRouter);
// SHAXSIY MOLIYAVIY TARIX. Rolga qarab ajratilgan modullardan (o'quvchi
// to'lovi / o'qituvchi maoshi / xodim oyligi) BIRLASHGAN ko'rinish
// quradi: boshlang'ich qoldiq → tranzaksiyalar → joriy balans.
// Faqat O'QIYDI - hech qanday yozuv qilmaydi.
router.use("/ledger", ledgerRouter);
// BOSHLANG'ICH QOLDIQ. Odam yaratish formasi buni o'z ichida yozadi;
// bu manzil qo'lda kiritish va yiqilganlarni tuzatish uchun.
router.use("/opening-balance", openingBalanceRouter);
// Tasdiqlar. "/expense-approvals" - eski (frontend shu manzilni biladi),
// "/approvals" - yangi umumiy nom: ro'yxatda endi chiqim ham, sozlama
// o'zgarishi ham bor. Ikkalasi bir xil routerga boradi.
router.use("/expense-approvals", expenseApprovalsRouter);
router.use("/approvals", expenseApprovalsRouter);

// AI maslahatchi (insight'lar, Action Center, sozlamalar)
router.use("/ai", aiRouter);

// Excel eksport. Ruxsat har bir hisobot turining O'ZIDA belgilangan
// (exports/registry), shuning uchun bu yerda umumiy requirePermission yo'q.
router.use("/exports", exportsRouter);

// Excel import. Eksportdan farqli: ruxsat YOZISH huquqiga bog'langan
// (finance.pay, salary.pay) - ro'yxatni ko'rish huquqi yetarli emas.
router.use("/imports", importsRouter);

export default router;
