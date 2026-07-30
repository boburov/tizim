import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/insight.service.js";

const bySubjects = asyncHandler(async (req, res) => {
  const data = await service.bySubjects(req.body.subjectIds);
  res.json({ success: true, data });
});

export default bySubjects;
