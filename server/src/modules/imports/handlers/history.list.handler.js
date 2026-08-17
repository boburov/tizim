import asyncHandler from "../../../middleware/asyncHandler.js";
import prisma from "../../../config/prisma.js";
import { withLegacyIds } from "../../../utils/serialize.js";
import { buildMeta } from "../../../utils/pagination.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import { listImporters } from "../registry/index.js";
import { hasPermission } from "../../../helpers/permission.helper.js";

// IMPORT TARIXI.
//
// FILIAL: branchFilter() - boshqa filialning import tarixi ko'rinmasin
// (unda fayl nomi va qatorlar soni bor, ya'ni biznes ma'lumoti).
//
// RUXSAT: foydalanuvchi faqat O'ZI ishlata oladigan import turlarining
// tarixini ko'radi. Aks holda maosh huquqi yo'q xodim maosh importlari
// bo'lganini (va hajmini) bilib olardi.
const historyList = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const allowedKeys = listImporters()
    .filter((imp) => hasPermission(req.permissions, imp.permission))
    .map((imp) => imp.key);

  if (!allowedKeys.length) {
    return res.json({ success: true, data: [], meta: buildMeta({ page, limit, total: 0 }) });
  }

  const filter = { ...branchFilter(), importerKey: { in: allowedKeys } };

  const [items, total] = await Promise.all([
    prisma.importJob.findMany({
      where: filter,
      // `rows` va `results` RO'YXATDA KERAK EMAS va ular eng og'ir
      // ustunlar (butun fayl mazmuni JSON'da). Mongo versiyasi ularni
      // ham tortib kelardi - 500 qatorli import tarixida bu bir necha
      // megabaytlik javob edi.
      omit: { rows: true, results: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.importJob.count({ where: filter }),
  ]);

  res.json({
    success: true,
    data: withLegacyIds(items),
    meta: buildMeta({ page, limit, total }),
  });
});

export default historyList;
