import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { BranchesModule } from './modules/branches/branches.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { BotModule } from './bot/bot.module.js';
import { NotificationJobsModule } from './jobs/notifications/notification-jobs.module.js';
import { StorageJobsModule } from './jobs/storage/storage-jobs.module.js';
import { HolidayJobsModule } from './jobs/holidays/holiday-jobs.module.js';
import { AttendanceJobsModule } from './jobs/attendance/attendance-jobs.module.js';
import { BotAuthModule } from './modules/bot-auth/bot-auth.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { NotificationTemplatesModule } from './modules/notification-templates/notification-templates.module.js';
import { SystemNotificationsModule } from './modules/system-notifications/system-notifications.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { LeadOptionsModule } from './modules/lead-options/lead-options.module.js';
import { FeedbackTypesModule } from './modules/feedback-types/feedback-types.module.js';
import { ArchiveReasonsModule } from './modules/archive-reasons/archive-reasons.module.js';
import { AttendanceSettingsModule } from './modules/attendance-settings/attendance-settings.module.js';
import { FeedbackModule } from './modules/feedback/feedback.module.js';
import { HolidaysModule } from './modules/holidays/holidays.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { ActivityHistoryModule } from './modules/activity-history/activity-history.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module.js';
import { BranchAnalyticsModule } from './modules/branch-analytics/branch-analytics.module.js';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { GroupsModule } from './modules/groups/groups.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { TeacherSalaryModule } from './modules/teacher-salary/teacher-salary.module.js';
import { AttendanceExemptionsModule } from './modules/attendance-exemptions/attendance-exemptions.module.js';
import { TeacherAttendanceModule } from './modules/teacher-attendance/teacher-attendance.module.js';
import { GradesModule } from './modules/grades/grades.module.js';
import { JournalModule } from './modules/journal/journal.module.js';
import { FinanceReportModule } from './modules/finance-report/finance-report.module.js';
import { ExpenseApprovalsModule } from './modules/expense-approvals/expense-approvals.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { FinanceOpsModule } from './modules/finance-ops/finance-ops.module.js';
import { ExpensesModule } from './modules/expenses/expenses.module.js';
import { DepositsModule } from './modules/deposits/deposits.module.js';
import { OpeningBalanceModule } from './modules/opening-balance/opening-balance.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ILDIZ MODUL — FAZA 1 (poydevor).
 *
 * FAZA 2.1: `CommonModule` qo'shildi — RBAC servislari, qo'riqchilar,
 * auth middleware, xato filtri va zod pipe'i.
 *
 * FAZA 2.2: birinchi marshrutlar ulandi (rollar o'qish, parol o'qish).
 * Trafik hamon Express'da (5000-port) — NestJS faqat tekshiruv uchun
 * 5001-portda turadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `.env` BITTA joyda — `server/.env`. Nusxa OLINMADI: ikki fayl
      // muqarrar ravishda bir-biridan uzoqlashadi va ikki ilova bir xil
      // sozlama bilan boshqacha ishlay boshlaydi.
      // `server_nest/.env` bo'lsa u USTUN turadi (lokal override uchun).
      envFilePath: ['.env', '../server/.env'],
      validate: validateEnv,
      // Tekshirilgan va hosila qiymatlar keshlanadi.
      cache: true,
    }),
    PrismaModule,
    CommonModule,
    HealthModule,
    // ── FAZA 2.3: auth moduli ──
    AuthModule,
    // ── FAZA 2.2: birinchi ko'chirilgan marshrutlar ──
    // Rollar — FAQAT O'QISH (mutatsiyalar Express'da qoladi).
    RolesModule,
    // ── FAZA 2.5a: foydalanuvchilar (14 marshrutdan 10 tasi) ──
    // Qolgan 4 tasi (staff yaratish, arxivlash, tiklash, butunlay
    // o'chirish) moliya/tasdiq modullariga tayanadi — FAZA 7/8 dan keyin.
    UsersModule,
    // ── FAZA 3: tashkiliy tuzilma ──
    BranchesModule,
    // ── FAZA 10: fon ishlari (pg-boss) ──
    // ⚠ Standart holda HECH NARSA ishga tushmaydi: `NEST_WORKERS_ENABLED`
    // va `NEST_WORKER_JOBS` bo'sh bo'lsa modul faqat `SchedulerService` ni
    // DI'ga qo'yadi, navbatlarga TEGMAYDI. Express yagona worker.
    JobsModule,
    // Job OILALARI — har biri o'z modulida va o'zini `JobsRegistry` ga
    // yozadi. ⚠ Ro'yxatda turishi ishga tushishi degani EMAS:
    // `NEST_WORKER_JOBS` bo'sh bo'lsa hech biri ishlamaydi.
    NotificationJobsModule,
    StorageJobsModule,
    HolidayJobsModule,
    AttendanceJobsModule,
    // ── FAZA 10: Telegram bot ──
    // ⚠ Polling standart holda O'CHIQ (`NEST_BOT_POLLING=false`) — bot
    // nusxasi faqat YUBORISH uchun ko'tariladi. Buyruqlarni Express
    // qabul qilishda davom etadi; `bot_locks` qulfi oxirgi to'siq.
    BotModule,
    // ── FAZA 2.6: Telegram mini-ilova autentifikatsiyasi ──
    // Marshrutlar OCHIQ (initData imzosi = autentifikatsiya), lekin
    // tezlik chegaralari Express bilan aynan bir xil.
    BotAuthModule,
    // Xonalar — filialning fizik resursi (`classes.*` ruxsatlari).
    RoomsModule,
    // ── FAZA 10: aloqa ──
    // Bildirishnomalar `holidays`/`leads`/`feedback` dan OLDIN keladi —
    // ular uning servisiga tayanadi.
    NotificationsModule,
    // Shablonlar — `notifications.send` oynasida tanlanadi.
    NotificationTemplatesModule,
    // Tizim oqimi (owner uchun ichki hodisalar).
    SystemNotificationsModule,
    // Fayllar/biriktirmalar — kvota, tozalash, egalik.
    StorageModule,
    // ── Kichik kataloglar (o'qish ochiq, yozish owner + ruxsat) ──
    LeadOptionsModule,
    FeedbackTypesModule,
    ArchiveReasonsModule,
    AttendanceSettingsModule,
    // Fikr-mulohaza (aloqa) — bildirishnomalarga tayanadi.
    FeedbackModule,
    // Bayramlar — PUL YO'LIDA (davomat/to'lov/maosh shunga tayanadi).
    HolidaysModule,
    // Global qidiruv (⌘K) va faoliyat tarixi — faqat o'qish.
    SearchModule,
    ActivityHistoryModule,
    // Lidlar (14/16) — `convert*` `groups.addStudent` ga tayanadi.
    LeadsModule,
    // Rahbariyat paneli (6/6) — faqat o'qish.
    AdminDashboardModule,
    // Filial tahlili — FAQAT xona bandligi (`/rooms`).
    BranchAnalyticsModule,
    // Faoliyat loglari — faqat o'qish (yozuvni Express `auditLog` yaratadi).
    ActivityLogsModule,
    // Kurs katalogi + narx matritsasi (global katalog, owner yozadi).
    CoursesModule,
    // ── FAZA 5a: guruhlar (24 marshrutdan 9 tasi — o'qish) ──
    // Qolgani moliya/maosh modullaridan KEYIN (2.5a/2.5b naqshi).
    GroupsModule,
    // ── FAZA 6: davomat (11/11 marshrut) ──
    AttendanceModule,
    // ── FAZA 8.1: o'qituvchi maoshi (15/15 marshrut) ──
    TeacherSalaryModule,
    // Davomatdan ozod davrlari (4/4).
    AttendanceExemptionsModule,
    // O'qituvchi davomati (2/2) — maoshga ta'sir qiladi, faqat manage.
    TeacherAttendanceModule,
    GradesModule,
    // ── FAZA 7: MOLIYA ──
    // Jurnal BIRINCHI ko'chiriladi: qolgan hamma moliya moduli
    // (to'lov, depozit, chiqim, maosh, qaytarim) unga yozadi.
    JournalModule,
    // Moliya hisoboti — KPI, dinamika, guruh kesimi, ledger, write-off.
    FinanceReportModule,
    // Tasdiqlar — IKKI manzil: /expense-approvals (eski) va /approvals.
    ExpenseApprovalsModule,
    // Moliya yadrosi — MARSHRUTSIZ. `financialTransaction` pul yozishning
    // yagona nuqtasi; chiqim/depozit/amallar modullari unga tayanadi.
    // Bu yerda ro'yxatga olinishi DI grafini ishga tushishda TEKSHIRADI.
    FinanceModule,
    // Moliyaviy amallar — qaytarim / o'tkazma / egasi puli / byudjet.
    FinanceOpsModule,
    // Umumiy chiqimlar + kategoriyalar (tasdiq oqimi bilan).
    ExpensesModule,
    // O'quvchi depoziti (oldindan to'lov / garov) — 8/8 marshrut.
    DepositsModule,
    // Boshlang'ich qoldiq (tizimga o'tishda kiritilgan qarz/avans) — 3/3.
    OpeningBalanceModule,
    // Shaxsiy moliyaviy tarix — SOF O'QISH modeli (2/2).
    LedgerModule,
  ],
})
export class AppModule {}
