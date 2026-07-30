import logger from "../config/logger.js";
import { recomputeAll } from "../modules/ai/services/recompute.service.js";

export const JOB_NAME = "intraday.ai-refresh";

// KUNDUZGI YANGILANISH - "AI har necha soatda o'zi qayta ko'rib chiqadi"
// talabining bajarilishi.
//
// FAQAT "fast" detektorlar ishlaydi (recompute.service.js dagi
// FAST_PIPELINE): qarz holati, issiq/sovuq lidlar, o'qituvchi bugun
// kelmagani. Bular kun ichida HAQIQATAN o'zgaradi.
//
// Og'ir trend detektorlari (churn, kurs foydaliligi, guruh medianasi)
// ATAYLAB kiritilmagan: ular 4 haftalik oynaga tayanadi va kun ichida
// amalda o'zgarmaydi, lekin hisoblashi eng qimmat. Ularni har 3 soatda
// qayta hisoblash - bir xil natija uchun Mongo'ni bekorga yuklash.
export default function defineAiIntradayRefresh(agenda) {
  agenda.define(JOB_NAME, async () => {
    const startedAt = Date.now();
    const results = await recomputeAll({ scope: "fast", trigger: "intraday" });

    const failed = results.filter((r) => r.error).length;
    logger.info(
      { branches: results.length, failed, ms: Date.now() - startedAt },
      "AI kunduzgi yangilanish tayyor",
    );
  });
}
