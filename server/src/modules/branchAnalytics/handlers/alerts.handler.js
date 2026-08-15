import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branchAlerts.service.js";

// ANOMALIYALAR: bo'sh xonalar, oshgan churn, yo'lda qotib qolgan
// inkassatsiya, mos kelmagan kassa balansi.
//
// Daraja bo'yicha saralangan - KRITIK faqat pul yo'qolganda yoki
// hisob-kitob buzilganda (alert charchog'iga qarshi).
const alerts = asyncHandler(async (_req, res) => {
  const data = await service.evaluate();
  res.json({ success: true, data });
});

export default alerts;
