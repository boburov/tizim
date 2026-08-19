import asyncHandler from "../../../middleware/asyncHandler.js";
import ApiError from "../../../utils/ApiError.js";
import * as intel from "../services/financialIntelligence.service.js";
import * as explain from "../services/explanation.service.js";

/**
 * MOLIYAVIY INTELLEKT — o'qish endpoint'lari.
 *
 * `req.permissions` HAR chaqiruvda uzatiladi: maoshga bog'liq
 * qoidalar ruxsatsiz foydalanuvchida UMUMAN ishga tushmaydi
 * (yon eshik yopiq — talab N).
 */

export const overview = asyncHandler(async (req, res) => {
  const data = await intel.getIntelligence(req.query, req.permissions);
  res.json({ success: true, data });
});

export const alerts = asyncHandler(async (req, res) => {
  const data = await intel.getIntelligence(req.query, req.permissions);
  res.json({ success: true, data: { alerts: data.alerts, counts: data.counts, comparison: data.comparison } });
});

export const briefing = asyncHandler(async (req, res) => {
  const data = await intel.getBriefing(req.query, req.permissions);
  res.json({ success: true, data });
});

/**
 * Bitta signal + IXTIYORIY AI izohi.
 *
 * `?explain=true` bo'lgandagina LLM chaqiriladi. Standart holatda
 * deterministik matn qaytadi — dashboard ochilishida LLM ishlamaydi.
 */
export const alertDetail = asyncHandler(async (req, res) => {
  const signal = await intel.getAlertById(req.params.alertId, req.query, req.permissions);
  if (!signal) throw new ApiError(404, "Signal topilmadi yoki bu davrda faol emas");

  const useAi = String(req.query.explain || "") === "true";
  const explanation = await explain.explainSignal(signal, { useAi });

  res.json({ success: true, data: { ...signal, explanation } });
});
