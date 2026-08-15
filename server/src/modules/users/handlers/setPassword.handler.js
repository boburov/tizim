import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";
import { credentialScope } from "../../../helpers/credentialScope.helper.js";

const setPassword = asyncHandler(async (req, res) => {
  // O'qish bilan bir xil ko'lam: boshqa filial xodimining parolini
  // ALMASHTIRISH ham o'sha hisobga kirishni beradi.
  const data = await usersService.setPassword(
    req.params.id,
    req.body.password,
    credentialScope(req),
  );
  res.json({ success: true, data, message: "Parol yangilandi" });
});

export default setPassword;
