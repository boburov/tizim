import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/roles.service.js";

// Rolni muzlatish/muzdan chiqarish. Muzlatilgan rol egasi panelga
// kira olmaydi (login rad etiladi, mavjud sessiya uziladi).
const setFrozen = asyncHandler(async (req, res) => {
  const data = await service.setFrozen(req.params.value, req.body, req.user);
  res.json({
    success: true,
    data,
    message: data.isFrozen ? "Rol muzlatildi" : "Rol muzdan chiqarildi",
  });
});

export default setFrozen;
