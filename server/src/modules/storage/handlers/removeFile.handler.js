import asyncHandler from "../../../middleware/asyncHandler.js";
import * as admin from "../services/storageAdmin.service.js";

const removeFile = asyncHandler(async (req, res) => {
  const data = await admin.removeFileById(req.params.id, req.user._id);
  res.json({ success: true, data, message: "Fayl o'chirildi" });
});

export default removeFile;
