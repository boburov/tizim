import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/assignments.service.js";

const myUnreadCount = asyncHandler(async (req, res) => {
  const data = await service.unreadCountForStudent(req.user._id);
  res.json({ success: true, data });
});

export default myUnreadCount;
