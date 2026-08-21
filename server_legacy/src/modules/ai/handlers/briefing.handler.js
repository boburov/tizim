import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildBriefing } from "../services/briefing.service.js";

// BRIFING - dashboardning yagona so'rovi.
//
// To'rtta savol (kecha / bugun / keyin / hozir) BITTA javobda qaytadi.
// Alohida endpointlarga bo'lish sahifani to'rtta turli vaqtdagi kesimni
// ko'rsatadigan "yuklanayotgan panellar to'plami" ga aylantirardi.
const briefing = asyncHandler(async (req, res) => {
  const data = await buildBriefing({
    actionLimit: req.query.actionLimit ? Number(req.query.actionLimit) : undefined,
  });
  res.json({ success: true, data });
});

export default briefing;
