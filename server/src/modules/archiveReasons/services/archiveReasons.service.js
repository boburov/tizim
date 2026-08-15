import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyIds, withLegacyId } from "../../../utils/serialize.js";

export const list = async ({
  search,
  includeInactive = false,
  page = 1,
  limit = 100,
}) => {
  const where = {};
  if (!includeInactive) where.isActive = true;
  if (search && search.trim()) {
    where.title = { contains: search.trim(), mode: "insensitive" };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.archiveReason.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.archiveReason.count({ where }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

export const getById = async (id) => {
  const doc = await prisma.archiveReason.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Sabab topilmadi");
  return doc;
};

export const create = async (body, currentUser) => {
  const title = String(body.title || "").trim();
  if (!title) throw new ApiError(400, "Sarlavha kerak");
  const doc = await prisma.archiveReason.create({
    data: { title, createdById: currentUser?.id || currentUser?._id || null },
  });
  return withLegacyId(doc);
};

export const update = async (id, body) => {
  await getById(id);
  const data = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) throw new ApiError(400, "Sarlavha kerak");
    data.title = title;
  }
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  const doc = await prisma.archiveReason.update({ where: { id }, data });
  return withLegacyId(doc);
};

export const softRemove = async (id) => {
  await getById(id);
  const doc = await prisma.archiveReason.update({
    where: { id },
    data: { isActive: false },
  });
  return withLegacyId(doc);
};

// Arxivlash/qaytarish amalini logga yozadi (users servisidan chaqiriladi)
export const logAction = async ({ user, action, reasonId, by }) => {
  let reasonRel = null;
  let reasonTitle = "";
  if (reasonId) {
    const r = await prisma.archiveReason.findUnique({
      where: { id: String(reasonId) },
      select: { id: true, title: true },
    });
    if (r) {
      reasonRel = r.id;
      reasonTitle = r.title;
    }
  }
  await prisma.archiveLog.create({
    data: {
      userId: String(user),
      action,
      reasonId: reasonRel,
      reasonTitle,
      performedById: by ? String(by) : null,
    },
  });
};

// Sabab bo'yicha hisobot: har sabab uchun arxivlangan/qaytarilgan sonlari
export const report = async ({ from, to, action } = {}) => {
  const where = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  if (action) where.action = action;

  // Mongo'da bu bitta $group + shartli $sum edi. Prisma groupBy shartli
  // yig'indini bilmaydi, shuning uchun (reasonId, action) bo'yicha
  // guruhlab, ikkala amalni JS'da bir qatorga yig'amiz.
  const rows = await prisma.archiveLog.groupBy({
    by: ["reasonId", "action"],
    where,
    _count: { _all: true },
  });

  const byReason = new Map();
  for (const r of rows) {
    const key = r.reasonId ? String(r.reasonId) : "null";
    const cur = byReason.get(key) || {
      reasonId: r.reasonId ? String(r.reasonId) : null,
      archiveCount: 0,
      restoreCount: 0,
      total: 0,
    };
    const n = r._count._all || 0;
    if (r.action === "archive") cur.archiveCount += n;
    if (r.action === "restore") cur.restoreCount += n;
    cur.total += n;
    byReason.set(key, cur);
  }

  const ids = [...byReason.values()].map((r) => r.reasonId).filter(Boolean);
  const reasons = ids.length
    ? await prisma.archiveReason.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      })
    : [];
  const titleMap = new Map(reasons.map((r) => [String(r.id), r.title]));

  // Sabab o'chirilgan bo'lsa oxirgi yozuvdagi nomni ko'rsatamiz.
  const fallbackTitle = async (rid) => {
    const last = await prisma.archiveLog.findFirst({
      where: { ...where, reasonId: rid },
      orderBy: { createdAt: "desc" },
      select: { reasonTitle: true },
    });
    return last?.reasonTitle || "(o'chirilgan sabab)";
  };

  const out = [];
  for (const r of [...byReason.values()].sort((a, b) => b.total - a.total)) {
    out.push({
      ...r,
      title: r.reasonId
        ? titleMap.get(r.reasonId) || (await fallbackTitle(r.reasonId))
        : "Sababsiz",
    });
  }
  return out;
};
