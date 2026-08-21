import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const reminderBulk = asyncHandler(async (req, res) => {
  const data = await service.setReminderBulk({
    ids: req.body.ids,
    followUpAt: req.body.followUpAt,
    followUpNote: req.body.followUpNote,
    assignedTo: req.body.assignedTo,
  });

  const ok = data.updated.length;
  const bad = data.failed.length;
  const verb = req.body.followUpAt ? "o'rnatildi" : "o'chirildi";
  const message = bad
    ? `${ok} ta lidga eslatma ${verb}, ${bad} tasida xatolik`
    : `${ok} ta lidga eslatma ${verb}`;

  res.json({ success: true, data, message });
});

export default reminderBulk;
