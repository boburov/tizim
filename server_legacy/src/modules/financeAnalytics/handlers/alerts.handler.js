import asyncHandler from "../../../middleware/asyncHandler.js";
import * as intel from "../services/financialIntelligence.service.js";

/**
 * `/alerts` — ESKI SHAKL, YAGONA MANBADAN.
 *
 * ── NEGA ALOHIDA SERVIS EMAS ──
 * STEP 5 da bu endpoint o'z qoidalar to'plamiga ega edi
 * (`alerts.service.js`). STEP 8 da intellekt qatlami qo'shilgach
 * ular IKKI XIL qoida dvigateliga aylanardi: bir xil holat uchun
 * ikki xil chegara, ikki xil matn va vaqt o'tib — ikki xil javob.
 *
 * Shuning uchun eski servis O'CHIRILDI va bu endpoint intellekt
 * qatlamiga yo'naltirildi. Javob shakli saqlanadi (mavjud
 * chaqiruvchilar buzilmasin), lekin manba BITTA.
 *
 * Ruxsat filtri ham shu yerdan meros: maoshga bog'liq signallar
 * ruxsatsiz foydalanuvchida umuman hisoblanmaydi.
 */
const handler = asyncHandler(async (req, res) => {
  const d = await intel.getIntelligence(req.query, req.permissions);
  res.json({
    success: true,
    data: {
      period: d.period,
      thresholds: d.thresholds,
      counts: {
        // Eski shakl `high/medium/low/good` edi — moslik uchun
        // saqlanadi, lekin ichkarida bitta manba.
        high: d.counts.urgent,
        medium: d.counts.watch,
        low: 0,
        good: d.counts.positive,
      },
      alerts: d.alerts.map((a) => ({
        code: a.type,
        severity: a.severity === "urgent" ? "high" : a.severity === "watch" ? "medium" : "good",
        title: a.title,
        explanation: (a.evidence || [])
          .slice(0, 3)
          .map((e) => `${e.label}: ${e.current ?? "—"}`)
          .join(", "),
        metric: a.metric,
        currentValue: a.currentValue,
        comparisonValue: a.previousValue,
        recommendedAction: a.recommendedActionType,
        entities: a.entityId ? { [`${a.entityType}Id`]: a.entityId } : {},
      })),
    },
  });
});

export default handler;
