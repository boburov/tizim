import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyIds, withLegacyId } from "../../../utils/serialize.js";

export const list = async ({
  search,
  includeInactive = false,
  page = 1,
  limit = 50,
}) => {
  const where = {};
  if (!includeInactive) where.isActive = true;
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.feedbackType.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.feedbackType.count({ where }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

export const getById = async (id) => {
  const doc = await prisma.feedbackType.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Feedback turi topilmadi");
  return withLegacyId(doc);
};

export const create = async ({ name }) => {
  const trimmed = String(name).trim();
  // DIQQAT: bazada ham qisman unique indeks bor (name WHERE isActive) -
  // bu tekshiruv faqat chiroyli xato xabari uchun, kafolat bazada.
  const exists = await prisma.feedbackType.findFirst({
    where: { name: trimmed, isActive: true },
  });
  if (exists) throw new ApiError(409, "Bunday tur mavjud");
  const doc = await prisma.feedbackType.create({ data: { name: trimmed } });
  return withLegacyId(doc);
};

export const update = async (id, body) => {
  const doc = await getById(id);
  const data = {};

  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
    if (trimmed !== doc.name) {
      const conflict = await prisma.feedbackType.findFirst({
        where: { id: { not: doc.id }, name: trimmed, isActive: true },
      });
      if (conflict) throw new ApiError(409, "Bunday tur mavjud");
    }
    data.name = trimmed;
  }
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  const updated = await prisma.feedbackType.update({ where: { id }, data });
  return withLegacyId(updated);
};

export const softRemove = async (id) => {
  await getById(id);
  const doc = await prisma.feedbackType.update({
    where: { id },
    data: { isActive: false },
  });
  return withLegacyId(doc);
};
