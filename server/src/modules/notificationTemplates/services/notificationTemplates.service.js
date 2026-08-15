import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyIds, withLegacyId } from "../../../utils/serialize.js";

// Kategoriyalar ro'yxati - ilgari Mongo modelidan kelardi.
// Endi yagona manba: prisma/schema.prisma dagi `TemplateCategory` enum.
export const TEMPLATE_CATEGORIES = Object.freeze([
  "payment",
  "debt",
  "class_cancel",
  "announcement",
  "holiday",
  "personal",
  "feedback_status",
  "custom",
]);

export const list = async ({
  search,
  category,
  includeInactive = false,
  page = 1,
  limit = 50,
}) => {
  const where = {};
  if (!includeInactive) where.isActive = true;
  if (category) where.category = category;
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.notificationTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.notificationTemplate.count({ where }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

export const getById = async (id) => {
  const doc = await prisma.notificationTemplate.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Shablon topilmadi");
  return doc;
};

const validateBody = (body) => {
  if (body.category && !TEMPLATE_CATEGORIES.includes(body.category)) {
    throw new ApiError(400, "Noto'g'ri kategoriya");
  }
};

export const create = async (body) => {
  validateBody(body);
  const trimmed = String(body.name || "").trim();
  if (!trimmed) throw new ApiError(400, "Nom kerak");

  const exists = await prisma.notificationTemplate.findFirst({
    where: { name: trimmed, isActive: true },
  });
  if (exists) throw new ApiError(409, "Bunday shablon mavjud");

  const doc = await prisma.notificationTemplate.create({
    data: {
      name: trimmed,
      body: String(body.body),
      category: body.category || "custom",
    },
  });
  return withLegacyId(doc);
};

export const update = async (id, body) => {
  const doc = await getById(id);
  validateBody(body);
  const data = {};

  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
    if (trimmed !== doc.name) {
      const conflict = await prisma.notificationTemplate.findFirst({
        where: { id: { not: doc.id }, name: trimmed, isActive: true },
      });
      if (conflict) throw new ApiError(409, "Bunday shablon mavjud");
    }
    data.name = trimmed;
  }
  if (body.body !== undefined) data.body = String(body.body);
  if (body.category !== undefined) data.category = body.category;
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  const updated = await prisma.notificationTemplate.update({ where: { id }, data });
  return withLegacyId(updated);
};

export const softRemove = async (id) => {
  await getById(id);
  const doc = await prisma.notificationTemplate.update({
    where: { id },
    data: { isActive: false },
  });
  return withLegacyId(doc);
};
