import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

// KPI kartalari: kutilayotgan soni, kutilayotgan chiqim summasi, xatolar.
// Ro'yxat bilan BIR XIL ko'rinish qoidalariga bo'ysunadi (filial + kategoriya
// ruxsati) - aks holda karta 12 ta deb turib ro'yxatda 3 ta chiqardi.
const stats = asyncHandler(async (req, res) => {
  const data = await service.stats({
    permissions: req.permissions,
    currentUser: req.user,
  });
  res.json({ success: true, data });
});

export default stats;
