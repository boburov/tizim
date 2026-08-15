import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/coursePrice.service.js";

const priceClear = asyncHandler(async (req, res) => {
  const data = await service.clearBranchPrice(
    req.params.id,
    req.params.branchId,
    req.user,
  );
  res.json({
    success: true,
    data,
    message: "Filial istisnosi olib tashlandi - bazaviy narx amal qiladi",
  });
});

export default priceClear;
