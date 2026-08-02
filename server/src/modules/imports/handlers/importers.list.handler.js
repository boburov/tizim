import asyncHandler from "../../../middleware/asyncHandler.js";
import { hasPermission } from "../../../helpers/permission.helper.js";
import { listImporters } from "../registry/index.js";

// Foydalanuvchi ishlata oladigan import turlari + ustun tavsifi.
// Client shu javobdan yo'riqnoma va ustun ro'yxatini quradi - ustunlar
// client'da takrorlanmaydi (eksportdagi bilan bir xil yondashuv).
const importersList = asyncHandler(async (req, res) => {
  const data = listImporters()
    .filter((imp) => hasPermission(req.permissions, imp.permission))
    .map((imp) => ({
      key: imp.key,
      label: imp.label,
      columns: imp.columns.map((c) => ({
        key: c.key,
        header: c.header,
        required: Boolean(c.required),
        note: c.note || "",
        example: c.example ?? "",
      })),
    }));

  res.json({ success: true, data });
});

export default importersList;
