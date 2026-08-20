import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branches.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";
import { hasPermission } from "../../../helpers/permission.helper.js";
import { PERMISSIONS } from "../../../constants/permissions.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);

  // BOSHQARUVCHI LOGINI — SO'RALSA VA RUXSAT BO'LSA.
  //
  // Bu endpoint filial tanlagichi uchun har qanday auth'langan
  // foydalanuvchiga ochiq (o'quvchi ham o'z filialini ko'radi), ya'ni
  // xodim logini standart javobda BO'LMASLIGI kerak.
  //
  // Ruxsat SHU YERDA tekshiriladi, servisda emas: servis "nima
  // so'ralgan" ni bajaradi, "kimga ruxsat" — HTTP qatlamining ishi.
  // `hasPermission` xom `.includes()` emas — u ruxsat iyerarxiyasini
  // hisobga oladi.
  const withManagers = String(req.query.withManagers) === "true"
    && hasPermission(req.permissions, PERMISSIONS.USERS_READ);

  const { items, total } = await service.list({
    search: req.query.search,
    includeInactive: req.query.includeInactive,
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
    withManagers,
    page,
    limit,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default list;
