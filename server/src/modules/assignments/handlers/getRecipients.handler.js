import asyncHandler from "../../../middleware/asyncHandler.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";
import * as service from "../services/assignments.service.js";

const getRecipients = asyncHandler(async (req, res) => {
  // Egalik tekshiruvi getById ichida (o'qituvchi faqat o'zinikini ko'radi).
  await service.getById(req.params.id, req.user);

  const { page, limit, skip } = parsePagination(req.query);
  const { items, total } = await service.getRecipientList(req.params.id, {
    page,
    limit,
    skip,
    status: req.query.status,
  });

  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default getRecipients;
