import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/coursePrice.service.js";

const priceSet = asyncHandler(async (req, res) => {
  const data = await service.setPrice(
    {
      courseId: req.params.id,
      branchId: req.body.branchId ?? null,
      amount: req.body.amount,
      validFrom: req.body.validFrom,
      note: req.body.note,
    },
    req.user,
  );
  res.json({
    success: true,
    data,
    message: req.body.branchId ? "Filial narxi saqlandi" : "Bazaviy narx saqlandi",
  });
});

export default priceSet;
