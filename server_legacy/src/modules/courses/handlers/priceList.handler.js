import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/coursePrice.service.js";

const priceList = asyncHandler(async (req, res) => {
  const data = await service.listForCourse(req.params.id);
  res.json({ success: true, data });
});

export default priceList;
