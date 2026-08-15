import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { LEAD_OPTION_KINDS } from "../../../constants/leadStatus.js";
import { withLegacyIds, withLegacyId } from "../../../utils/serialize.js";

// escapeRegex KERAK EMAS: Prisma `contains` matnni SQL parametri sifatida
// uzatadi, ya'ni "(" kabi belgi so'rovni yiqita olmaydi.

export const list = async ({ kind, search, includeInactive = false }) => {
  const where = {};
  if (kind) where.kind = kind;
  if (!includeInactive) where.isActive = true;
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }
  const items = await prisma.leadOption.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return { items: withLegacyIds(items), total: items.length };
};

export const getById = async (id) => {
  const doc = await prisma.leadOption.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Sozlama topilmadi");
  return withLegacyId(doc);
};

export const create = async (body, currentUser) => {
  if (!LEAD_OPTION_KINDS.includes(body.kind)) {
    throw new ApiError(400, "Noto'g'ri tur");
  }
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError(400, "Nom kerak");
  const doc = await prisma.leadOption.create({
    data: {
      kind: body.kind,
      name,
      createdById: currentUser?.id || currentUser?._id || null,
    },
  });
  return withLegacyId(doc);
};

export const update = async (id, body) => {
  await getById(id);
  const data = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, "Nom kerak");
    data.name = name;
  }
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  const doc = await prisma.leadOption.update({ where: { id }, data });
  return withLegacyId(doc);
};

export const softRemove = async (id) => {
  await getById(id);
  const doc = await prisma.leadOption.update({
    where: { id },
    data: { isActive: false },
  });
  return withLegacyId(doc);
};
