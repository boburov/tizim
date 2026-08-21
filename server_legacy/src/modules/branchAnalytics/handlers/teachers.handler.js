import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branchTeachers.service.js";

// O'QITUVCHI RESURSI filiallar kesimida: nechta o'qituvchi, o'qituvchi
// boshiga necha guruh/o'quvchi, maosh va uning daromaddagi ulushi.
const teachers = asyncHandler(async (req, res) => {
  const data = await service.teachers({
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json({ success: true, data });
});

export default teachers;
