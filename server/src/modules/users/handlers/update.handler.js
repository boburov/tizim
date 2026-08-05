import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const update = asyncHandler(async (req, res) => {
  // currentUser - HR sanasi o'zgarganda audit yozuvida "kim" bo'lishi uchun.
  const user = await usersService.update(req.params.id, req.body, req.user);
  res.json({ success: true, data: user, message: "Saqlandi" });
});

export default update;
