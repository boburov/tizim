import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";
import { credentialScope } from "../../../helpers/credentialScope.helper.js";

const getPassword = asyncHandler(async (req, res) => {
  // Filial ko'lami req'da (requireAuth o'rnatadi), lekin parol uchun u
  // TORAYTIRILADI: `branches.view_all` bu yerda o'tkazgich bo'lmasligi
  // kerak - qarang helpers/credentialScope.helper.js.
  const data = await usersService.getPassword(req.params.id, credentialScope(req));
  res.json({ success: true, data });
});

export default getPassword;
