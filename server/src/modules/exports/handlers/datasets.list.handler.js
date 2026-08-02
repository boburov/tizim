import asyncHandler from "../../../middleware/asyncHandler.js";
import { hasPermission } from "../../../helpers/permission.helper.js";
import { listDatasets, visibleColumns } from "../registry/index.js";

// Foydalanuvchi eksport qila oladigan hisobotlar va ULARNING ustunlari.
//
// Client checkbox'larni SHU javobdan quradi - ustunlar ro'yxati client'da
// qattiq yozilmaydi. Shu sababli serverga ustun qo'shilsa, client'da
// hech narsa o'zgartirmasdan darhol paydo bo'ladi.
//
// Ruxsati yetmagan dataset va ustunlar javobga UMUMAN tushmaydi -
// "bor, lekin bloklangan" deb ko'rsatish ham ortiqcha ma'lumot berardi.
const datasetsList = asyncHandler(async (req, res) => {
  const data = listDatasets()
    .filter((ds) => hasPermission(req.permissions, ds.permission))
    .map((ds) => ({
      key: ds.key,
      label: ds.label,
      columns: visibleColumns(ds, req.permissions).map((col) => ({
        key: col.key,
        header: col.header,
        type: col.type,
        default: Boolean(col.default),
      })),
    }));

  res.json({ success: true, data });
});

export default datasetsList;
