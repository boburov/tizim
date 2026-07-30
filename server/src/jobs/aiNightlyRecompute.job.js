import logger from "../config/logger.js";
import { recomputeAll } from "../modules/ai/services/recompute.service.js";

export const JOB_NAME = "daily.ai-recompute";

// Tungi AI qayta hisoblash: barcha filiallar bo'yicha o'quvchi xavf
// ballarini yangilaydi va Insight'larni upsert qiladi.
//
// VAQTI MUHIM: kunlik accrual (00:20) va kurs arxivlashdan (00:10) KEYIN
// ishlashi kerak, aks holda qarz kunlari va faol guruhlar ro'yxati eski
// bo'ladi va ballar bir kun orqada qoladi.
export default function defineAiNightlyRecompute(agenda) {
  agenda.define(JOB_NAME, async () => {
    const startedAt = Date.now();
    const results = await recomputeAll();

    const totals = results.reduce(
      (a, r) => {
        if (!r.students) return a;
        a.scanned += r.students.scanned;
        for (const kind of ["churn", "payment"]) {
          a[kind].created += r.students[kind].created;
          a[kind].updated += r.students[kind].updated;
          a[kind].closed += r.students[kind].closed;
          a[kind].skipped += r.students[kind].skippedLowConfidence;
        }
        return a;
      },
      {
        scanned: 0,
        churn: { created: 0, updated: 0, closed: 0, skipped: 0 },
        payment: { created: 0, updated: 0, closed: 0, skipped: 0 },
      },
    );

    logger.info(
      { branches: results.length, ...totals, ms: Date.now() - startedAt },
      "AI tungi qayta hisoblash tayyor",
    );
  });
}
