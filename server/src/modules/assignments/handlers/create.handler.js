import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/assignments.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await service.create({
    body: req.body,
    file: req.file,
    currentUser: req.user,
  });
  res.status(201).json({ success: true, data, message: "Vazifa yuborildi" });
});

export default create;
