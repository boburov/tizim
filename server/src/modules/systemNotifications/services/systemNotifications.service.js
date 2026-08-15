import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyIds, withLegacyId } from "../../../utils/serialize.js";

// Saqlanadigan maksimal bildirishnoma soni - oshganda eng eskilari o'chiriladi.
export const MAX_SYSTEM_NOTIFICATIONS = 100;

// status: "all" | "read" | "unread"
export const list = async ({ status = "all", page = 1, limit = 20 }) => {
  const where = {};
  if (status === "read") where.isRead = true;
  if (status === "unread") where.isRead = false;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.systemNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.systemNotification.count({ where }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

export const getUnreadCount = async () =>
  prisma.systemNotification.count({ where: { isRead: false } });

export const markRead = async (id) => {
  const doc = await prisma.systemNotification.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, "Bildirishnoma topilmadi");
  if (doc.isRead) return withLegacyId(doc);

  const updated = await prisma.systemNotification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });
  return withLegacyId(updated);
};

export const markAllRead = async () => {
  const res = await prisma.systemNotification.updateMany({
    where: { isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { modified: res.count || 0 };
};

// Yangi tizim bildirishnomasi yaratish - boshqa modullar shu funksiyani chaqiradi.
export const create = async ({ message, link = null } = {}) => {
  const text = String(message || "").trim();
  if (!text) throw new ApiError(400, "Bildirishnoma matni kerak");

  const doc = await prisma.systemNotification.create({
    data: {
      message: text,
      link: link ? String(link).trim() : null,
    },
  });

  await enforceMaxDocuments();
  return withLegacyId(doc);
};

// Cap: jami soni MAX dan oshsa, eng eski hujjatlarni o'chiramiz.
const enforceMaxDocuments = async () => {
  const count = await prisma.systemNotification.count();
  if (count <= MAX_SYSTEM_NOTIFICATIONS) return;

  const overflow = count - MAX_SYSTEM_NOTIFICATIONS;
  const oldest = await prisma.systemNotification.findMany({
    orderBy: { createdAt: "asc" },
    take: overflow,
    select: { id: true },
  });

  if (oldest.length) {
    await prisma.systemNotification.deleteMany({
      where: { id: { in: oldest.map((d) => d.id) } },
    });
  }
};
