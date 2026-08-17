import asyncHandler from "../../../middleware/asyncHandler.js";
import ApiError from "../../../utils/ApiError.js";
import prisma from "../../../config/prisma.js";
import { sendXlsx } from "../../../utils/sendXlsx.js";
import { resolveColumns } from "../registry/index.js";
import { generateXlsx } from "../services/exports.service.js";

// Fayl nomi uchun: o'zbekcha apostrof/harflarni ASCII'ga tushiradi.
// Content-Disposition'ning oddiy `filename=` qismi faqat ASCII qabul
// qiladi; to'liq nom `filename*=UTF-8''` da yuboriladi.
const asciiSlug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "export";

const pad2 = (n) => String(n).padStart(2, "0");

const stamp = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;

// Ma'lumot varag'idagi "Filtrlar" qatori uchun o'qiladigan matn.
const buildFilterLabel = (filters) => {
  const parts = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join("; ") : "";
};

const resolveBranchLabel = async (req) => {
  if (!req.branchId) {
    return req.canSeeAllBranches ? "Barcha filiallar" : "Biriktirilgan filiallar";
  }
  // Faqat `name` o'qiladi. Prisma `select` bilan `id` AVTOMATIK kelmaydi
  // (Mongo `_id` ni doim qaytarardi) - bu yerda kerak ham emas, chunki
  // natija Excel varag'idagi matn.
  const branch = await prisma.branch.findUnique({
    where: { id: req.branchId },
    select: { name: true },
  });
  return branch?.name || "Noma'lum filial";
};

const download = asyncHandler(async (req, res) => {
  // dataset requireDatasetPermission tomonidan qo'yilgan (ruxsat tekshirilgan).
  const { dataset } = req;

  // USTUNLAR: reyestr bo'yicha oq ro'yxatlanadi. Client yuborgan
  // noma'lum yoki ruxsatsiz kalit shu yerda tushib qoladi - shuning
  // uchun so'rov tanasi orqali qo'shimcha maydon "so'rab olib" bo'lmaydi.
  const columns = resolveColumns(dataset, req.permissions, req.body.columns);
  if (!columns.length) {
    throw new ApiError(400, "Kamida bitta ustun tanlang");
  }

  // FILTRLAR: har bir dataset o'z sxemasi bilan tekshiradi. Sxemada
  // yo'q kalit (masalan `role`) jimgina tushib qoladi - Zod strip qiladi.
  let filters;
  try {
    filters = dataset.filterSchema.parse(req.body.filters || {});
  } catch {
    throw new ApiError(400, "Filtrlar noto'g'ri");
  }

  const generatedAt = new Date();
  const { buffer, rowCount } = await generateXlsx({
    dataset,
    columns,
    filters,
    meta: {
      actorName: [req.user.firstName, req.user.lastName].filter(Boolean).join(" "),
      generatedAt,
      branchLabel: await resolveBranchLabel(req),
      filterLabel: buildFilterLabel(filters),
    },
  });

  const fileName = `${asciiSlug(dataset.fileBase)}-${stamp(generatedAt)}.xlsx`;

  // Qatorlar sonini client toast'da ko'rsatadi (tana - binar, o'qib bo'lmaydi).
  sendXlsx(res, buffer, fileName, { "X-Export-Rows": rowCount });
});

export default download;
