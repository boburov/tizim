import logger from "../config/logger.js";
import { recomputeAll } from "../modules/ai/services/recompute.service.js";

export const JOB_NAME = "daily.ai-recompute";

// TUNGI TO'LIQ TAHLIL - proaktiv tizimning yuragi.
//
// Barcha domenlar bo'yicha barcha detektorlar ishlaydi: o'quvchilar,
// guruhlar, o'qituvchilar, kurslar, lidlar, moliya. Foydalanuvchi hech
// narsa so'ramaydi - insight'lar o'zi yaratiladi, o'zi yangilanadi va
// signal yo'qolganda o'zi yopiladi.
//
// VAQTI MUHIM: kunlik accrual (00:20), kurs arxivlash (00:10) va AI hayot
// siklidan (00:40) KEYIN ishlashi kerak - aks holda qarz kunlari va faol
// guruhlar ro'yxati eski bo'ladi va ballar bir kun orqada qoladi.
export default function defineAiNightlyRecompute(agenda) {
  agenda.define(JOB_NAME, async () => {
    const startedAt = Date.now();
    const results = await recomputeAll({ scope: "full", trigger: "nightly" });

    // Xulosa jurnalda: bitta qatordan butun markazning holati ko'rinishi
    // kerak, aks holda muammoni topish uchun o'nlab qatorni o'qishga
    // to'g'ri keladi. Batafsil statistika har filialning AiRun yozuvida.
    const totals = results.reduce(
      (a, r) => {
        if (r.error) {
          a.failed += 1;
          return a;
        }
        a.branches += 1;
        a.high += r.counts?.high || 0;
        a.medium += r.counts?.medium || 0;
        a.opportunities += r.counts?.opportunities || 0;
        a.impactAtRisk += r.counts?.impactAtRisk || 0;
        return a;
      },
      { branches: 0, failed: 0, high: 0, medium: 0, opportunities: 0, impactAtRisk: 0 },
    );

    logger.info({ ...totals, ms: Date.now() - startedAt }, "AI tungi to'liq tahlil tayyor");
  });
}
