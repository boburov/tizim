import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/courses.service.js";

const remove = asyncHandler(async (req, res) => {
  const { course, activeGroups } = await service.softRemove(req.params.id);
  res.json({
    success: true,
    data: course,
    // Nechta faol guruh ta'sirlanganini AYTAMIZ - jimgina nofaol qilish
    // "nega yangi guruhda kurs yo'q" degan savolni keltirib chiqarardi.
    message: activeGroups
      ? `Kurs nofaol qilindi. ${activeGroups} ta faol guruh o'zgarishsiz qoldi.`
      : "Kurs nofaol qilindi",
  });
});

export default remove;
