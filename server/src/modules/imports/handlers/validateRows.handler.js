import asyncHandler from "../../../middleware/asyncHandler.js";
import { validateRows } from "../services/importEngine.service.js";

/**
 * JADVAL OQIMI, 2-BOSQICH: tahrirlangan qatorlarni tekshiradi.
 * Hech narsa yozilmaydi - client jadvalni shu javob bo'yicha bo'yaydi.
 */
const validateRowsHandler = asyncHandler(async (req, res) => {
  const data = await validateRows({
    importer: req.importer,
    rows: req.body.rows,
    actor: { currentUser: req.user, permissions: req.permissions },
  });

  res.json({ success: true, data });
});

export default validateRowsHandler;
