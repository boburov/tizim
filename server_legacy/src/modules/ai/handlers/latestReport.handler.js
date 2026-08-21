import asyncHandler from "../../../middleware/asyncHandler.js";
import { latestReport } from "../services/report.service.js";

// Dashboard "so'nggi hisobot" kartasi uchun. null qaytishi MUMKIN
// (birinchi hisobot hali tuzilmagan) - bu xato emas, va 404 qaytarish
// frontendni bo'sh holatni xatodan ajratishga majburlardi.
const latest = asyncHandler(async (req, res) => {
  const data = await latestReport(req.query.period || "daily");
  res.json({ success: true, data });
});

export default latest;
