import logger from "../config/logger.js";
import { buildReportsForAll } from "../modules/ai/services/report.service.js";

export const DAILY_JOB = "daily.ai-report";
export const WEEKLY_JOB = "weekly.ai-report";
export const MONTHLY_JOB = "monthly.ai-report";

// AVTOMATIK HISOBOTLAR - kunlik / haftalik / oylik.
//
// Hisobot O'TGAN TUGAGAN davrni qamraydi (kecha, o'tgan hafta, o'tgan oy),
// joriy davrni EMAS. Sabab: yarim kun ma'lumoti bilan "kunlik hisobot"
// chiqarish har ertalab "daromad tushdi" degan soxta xulosa berardi.
//
// Hisobot SAQLANADI (har so'rovda qayta hisoblanmaydi): kechagi hisobotni
// bugun qayta hisoblasak, o'sha paytdan keyin o'zgargan ma'lumot (kechikib
// kiritilgan davomat, keyin qilingan to'lov) uni jimgina o'zgartiradi -
// owner esa kecha boshqa raqamni ko'rgan. Bu ishonchni yo'qotadi.
const run = (period) => async () => {
  const startedAt = Date.now();
  const results = await buildReportsForAll(period);
  const failed = results.filter((r) => r.error).length;
  logger.info(
    { period, branches: results.length, failed, ms: Date.now() - startedAt },
    "AI hisobot tuzildi",
  );
};

export default function defineAiReports(agenda) {
  agenda.define(DAILY_JOB, run("daily"));
  agenda.define(WEEKLY_JOB, run("weekly"));
  agenda.define(MONTHLY_JOB, run("monthly"));
}
