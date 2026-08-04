import agenda from "../config/agenda.js";
import logger from "../config/logger.js";
import defineCleanupExpiredTokens, {
  JOB_NAME as CLEANUP_JOB,
} from "./cleanupExpiredTokens.job.js";
import defineHolidayGreetings, {
  JOB_NAME as HOLIDAY_JOB,
} from "./holidayGreetings.job.js";
import defineAttendanceReminders, {
  JOB_NAME as ATTENDANCE_UNMARKED_JOB,
} from "./attendanceReminders.job.js";
import defineLowAttendanceDigest, {
  JOB_NAME as LOW_ATTENDANCE_JOB,
} from "./lowAttendanceDigest.job.js";
import defineNotificationDeliver from "./notificationDeliver.job.js";
import defineNotificationSchedule from "./notificationSchedule.job.js";
import defineAssignmentDeliver from "./assignmentDeliver.job.js";
import defineStorageCleanup, {
  JOB_NAME as STORAGE_CLEANUP_JOB,
} from "./storageCleanup.job.js";
import defineLeadFollowupReminders, {
  JOB_NAME as LEAD_FOLLOWUP_JOB,
} from "./leadFollowupReminders.job.js";
import defineGenerateMonthlyFinance, {
  JOB_NAME as MONTHLY_FINANCE_JOB,
} from "./generateMonthlyFinance.job.js";
import defineGenerateMonthlySalary, {
  JOB_NAME as MONTHLY_SALARY_JOB,
} from "./generateMonthlySalary.job.js";
import defineAutoEndGroups, {
  JOB_NAME as AUTO_END_GROUPS_JOB,
} from "./autoEndGroups.job.js";
import defineDailyAccrueFinance, {
  JOB_NAME as DAILY_ACCRUE_JOB,
  accrueToday,
} from "./dailyAccrueFinance.job.js";
import defineUsageHeartbeat, {
  JOB_NAME as USAGE_HEARTBEAT_JOB,
  isHeartbeatConfigured,
  sendHeartbeat,
} from "./usageHeartbeat.job.js";
import defineAiNightlyRecompute, {
  JOB_NAME as AI_RECOMPUTE_JOB,
} from "./aiNightlyRecompute.job.js";
import defineAiIntradayRefresh, {
  JOB_NAME as AI_INTRADAY_JOB,
} from "./aiIntradayRefresh.job.js";
import defineAiLifecycle, {
  JOB_NAME as AI_LIFECYCLE_JOB,
} from "./aiLifecycle.job.js";
import defineAiReports, {
  DAILY_JOB as AI_DAILY_REPORT_JOB,
  WEEKLY_JOB as AI_WEEKLY_REPORT_JOB,
  MONTHLY_JOB as AI_MONTHLY_REPORT_JOB,
} from "./aiReports.job.js";
import defineAiMorningDigest, {
  JOB_NAME as AI_DIGEST_JOB,
} from "./aiMorningDigest.job.js";
import defineAiNarration, {
  JOB_NAME as AI_NARRATION_JOB,
} from "./aiNarration.job.js";
import { catchUpMonthlyGeneration } from "./catchUpMonthly.js";
import * as groupsService from "../modules/groups/services/groups.service.js";

// Barcha cron jadvallari mahalliy (Asia/Tashkent) vaqt bo'yicha ishlaydi -
// server qaysi TZ da bo'lishidan qat'i nazar. Aks holda UTC serverда "20:00"
// Toshkentда 01:00 da ishlab, NOTO'G'RI kunni qamrab olardi.
const TZ = process.env.TZ_NAME || "Asia/Tashkent";
// agenda.every(interval, name, data, options) - vaqt zonasini options'da beramiz
const every = (cron, name) => agenda.every(cron, name, undefined, { timezone: TZ });

export const startJobs = async () => {
  defineCleanupExpiredTokens(agenda);
  defineHolidayGreetings(agenda);
  defineAttendanceReminders(agenda);
  defineLowAttendanceDigest(agenda);
  defineNotificationDeliver(agenda);
  defineNotificationSchedule(agenda);
  defineAssignmentDeliver(agenda);
  defineStorageCleanup(agenda);
  defineLeadFollowupReminders(agenda);
  defineGenerateMonthlyFinance(agenda);
  defineGenerateMonthlySalary(agenda);
  defineAutoEndGroups(agenda);
  defineDailyAccrueFinance(agenda);
  defineAiNightlyRecompute(agenda);
  defineAiIntradayRefresh(agenda);
  defineAiLifecycle(agenda);
  defineAiReports(agenda);
  defineAiMorningDigest(agenda);
  defineAiNarration(agenda);
  defineUsageHeartbeat(agenda);

  await agenda.start();

  // Har kuni 03:00 da eski tokenlarni tozalash
  await every("0 3 * * *", CLEANUP_JOB);

  // Bayram tabriklari - har kuni 08:30 da (past davomat bilan to'qnashmasin)
  await every("30 8 * * *", HOLIDAY_JOB);

  // Belgilanmagan davomat eslatmasi - har kuni 20:00 da
  await every("0 20 * * *", ATTENDANCE_UNMARKED_JOB);
  // Past davomat hisoboti - har dushanba 09:30 da
  await every("30 9 * * 1", LOW_ATTENDANCE_JOB);

  // Lid qayta bog'lanish eslatmalari - har 5 daqiqada vaqti kelganlarni tekshiradi
  await every("*/5 * * * *", LEAD_FOLLOWUP_JOB);

  // Oylik moliya generatsiyasi - har oy 1-sanasi 00:05 da
  await every("5 0 1 * *", MONTHLY_FINANCE_JOB);
  // Oylik maosh generatsiyasi - har oy 1-sanasi 00:06 da (moliyadan keyin)
  await every("6 0 1 * *", MONTHLY_SALARY_JOB);

  // Saqlagich avto-tozalash - har kuni 02:30 da. Job HAR KUNI yuradi,
  // lekin ishni sozlamadagi chastota (haftalik/oylik/yarim yillik)
  // bo'yicha vaqti kelganda bajaradi - chastota o'zgarsa cronni qayta
  // yozish kerak bo'lmasin. 02:30 - token tozalash (03:00) va AI
  // hisoblashdan (01:00) tashqarida, tungi eng bo'sh oyna.
  await every("30 2 * * *", STORAGE_CLEANUP_JOB);

  // Tugash sanasi yetgan kurslarni avto-arxivlash - har kuni 00:10 da
  await every("10 0 * * *", AUTO_END_GROUPS_JOB);
  // Kunlik dars-asosli qarz accrual - har kuni 00:20 da (kurs arxivlashdan keyin:
  // tugagan guruh yangi dars accrual qilmasin).
  await every("20 0 * * *", DAILY_ACCRUE_JOB);

  // --- AI OPERATSIYALAR MARKAZI: kunlik zanjir ---
  //
  // TARTIB ATAYLAB shunday va uni o'zgartirish natijalarni buzadi:
  //
  //   00:10  kurs arxivlash        (mavjud)
  //   00:20  kunlik qarz accrual   (mavjud)
  //   00:40  AI hayot sikli        → eskirgan insight'lar YOPILADI
  //   01:00  AI to'liq hisoblash   → yangi insight'lar YARATILADI
  //   07:00  AI kunlik hisobot     → tugagan kun (kecha) qamraladi
  //   08:00  AI ertalabki digest   → hisobot + insight'lar owner'ga ketadi
  //   09:00+ har 3 soatda tez yangilanish (qarz, lidlar, o'qituvchi davomati)
  //
  // Hayot sikli hisoblashdan OLDIN: eskirgan insight avval yopilishi kerak,
  // aks holda yangi yaratilgani darhol "muddati o'tgan" deb yopilib qolardi.
  await every("40 0 * * *", AI_LIFECYCLE_JOB);

  // AI to'liq qayta hisoblash - har kuni 01:00 da. Kunlik accrual (00:20) va
  // kurs arxivlashdan (00:10) KEYIN: aks holda qarz kunlari va faol guruhlar
  // ro'yxati eski bo'lib, ballar bir kun orqada qolardi.
  await every("0 1 * * *", AI_RECOMPUTE_JOB);

  // Kunlik hisobot - 07:00. Kecha TUGAGAN kunni qamraydi, shuning uchun
  // tungi hisoblashdan keyin bo'lishi yetarli.
  await every("0 7 * * *", AI_DAILY_REPORT_JOB);
  // Haftalik hisobot - dushanba 07:10 (o'tgan to'liq haftani qamraydi).
  await every("10 7 * * 1", AI_WEEKLY_REPORT_JOB);
  // Oylik ijroiya hisoboti - oyning 1-sanasi 07:20 (o'tgan oyni qamraydi).
  // Oylik moliya generatsiyasidan (00:05) keyin: o'tgan oy yopilgan bo'lishi kerak.
  await every("20 7 1 * *", AI_MONTHLY_REPORT_JOB);

  // Ertalabki digest - 08:00, kunlik hisobotdan KEYIN.
  // Bu proaktivlik halqasini yopadi: owner ilovani ochmasa ham ko'radi.
  await every("0 8 * * *", AI_DIGEST_JOB);

  // Kunduzgi tez yangilanish - ish vaqtida har 3 soatda (09:00-21:00).
  // Faqat kun ichida o'zgaradigan detektorlar ishlaydi; og'ir trend
  // hisoblashlari tungi jobda qoladi. Tunda ishlamaydi - o'zgarish yo'q.
  await every("0 9,12,15,18,21 * * *", AI_INTRADAY_JOB);

  // AI narrator - har soatning 25-daqiqasida.
  //
  // NEGA SOATLIK VA NEGA QAYTA HISOBLASHDAN AJRATILGAN: narrator Gemini
  // bepul darajasidan foydalanadi va bir yurishda atigi 25 ta insight
  // ishlaydi. Uni qayta hisoblash oxiriga ulasak, 400 ta insight bir
  // zumda navbatga tushib limitga urilardi va ko'pchiligi matnsiz
  // qolardi. Soatlik yurish yuklamani kunga tekis yoyadi.
  //
  // 25-daqiqa: boshqa joblar soatning 0/5/10/20-daqiqalarida turadi -
  // ular bilan bir vaqtda ishlamasin.
  await every("25 * * * *", AI_NARRATION_JOB);

  // Admin panelga usage heartbeat - har 15 daqiqada. Faqat admin panel
  // orqali provision qilingan tenantlarda ishlaydi (ADMIN_API_URL bo'lsa);
  // standalone/lokal o'rnatmalarda butunlay o'chiq qoladi.
  if (isHeartbeatConfigured()) {
    await every("*/15 * * * *", USAGE_HEARTBEAT_JOB);
    // Startupda darrov bir marta yuboramiz - limitlar keshini to'ldirish uchun
    // (15 daqiqa kutmasdan). Await qilinmaydi: startup bloklanmasin.
    sendHeartbeat().catch(() => null);
    logger.info("Usage heartbeat yoqildi (har 15 daqiqada)");
  }

  logger.info({ timezone: TZ }, "Agenda ishga tushirildi");

  // Server o'chiq paytda (1-sanada) o'tkazib yuborilgan oylik generatsiyani fonда to'ldiradi.
  // Await qilinmaydi - startup'ni bloklamaslik uchun; o'zi xatolarni ushlaydi.
  catchUpMonthlyGeneration();

  // Boot catch-up: server o'chiq paytda tugash sanasi yetgan kurslarni arxivlaydi.
  groupsService.processDueGroupEnds().catch((err) => {
    logger.warn({ err }, "Boot: tugagan kurslar avto-arxivlanmadi");
  });

  // Boot catch-up: server o'chiq paytda o'tkazib yuborilgan kunlik dars-asosli
  // accrual'ni bugungi kesimga suradi. Await qilinmaydi - startup bloklanmasin.
  accrueToday().catch((err) => {
    logger.warn({ err }, "Boot: kunlik accrual bajarilmadi");
  });
};

export const stopJobs = async () => {
  await agenda.stop();
  logger.info("Agenda to'xtatildi");
};
