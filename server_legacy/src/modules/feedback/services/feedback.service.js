import prisma from "../../../config/prisma.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import ApiError from "../../../utils/ApiError.js";
import {
  branchGroupFilter,
  branchUserFilter,
} from "../../../helpers/branchContext.helper.js";

const FEEDBACK_STATUS_LABEL = {
  new: "Yangi",
  in_review: "Ko'rib chiqilmoqda",
  resolved: "Hal qilindi",
  rejected: "Rad etildi",
};

// `id` HAR JOYDA ATAYLAB: Prisma `select` bilan uni avtomatik
// qaytarmaydi (Mongo `_id` ni doim qaytarardi), klient esa yozuvni
// `_id` bo'yicha ochadi.
const TYPE_SELECT = { id: true, name: true, isActive: true };
const GROUP_SELECT = { id: true, name: true };
const USER_SELECT = { id: true, firstName: true, lastName: true, role: true };

const ensureType = async (typeId) => {
  const t = await prisma.feedbackType.findUnique({ where: { id: String(typeId) } });
  if (!t) throw new ApiError(400, "Feedback turi topilmadi");
  return t;
};

const ensureGroup = async (groupId) => {
  if (!groupId) return null;
  const g = await prisma.group.findUnique({ where: { id: String(groupId) } });
  if (!g) throw new ApiError(400, "Guruh topilmadi");
  return g;
};

export const submit = async (body, currentUser) => {
  await ensureType(body.type);
  await ensureGroup(body.group);

  const isAnonymous = !!body.isAnonymous;
  const message = String(body.message || "").trim();
  if (message.length < 5) {
    throw new ApiError(400, "Matn kamida 5 belgidan iborat bo'lishi kerak");
  }

  // `author`/`type`/`group` -> `authorId`/`typeId`/`groupId`:
  // Prisma'da nomsiz maydonlar RELATION.
  const doc = await prisma.feedback.create({
    data: {
      authorId: isAnonymous ? null : String(currentUser._id),
      authorRoleSnapshot: currentUser.role,
      isAnonymous,
      typeId: String(body.type),
      groupId: body.group ? String(body.group) : null,
      message,
      status: "new",
    },
  });
  return withLegacyId(doc);
};

// FILIAL KO'LAMI: Feedback'da `branchId` YO'Q va u IKKI yo'l bilan
// filialga bog'lanadi - MUALLIF (`author`) yoki GURUH (`group`) orqali.
//
// Nega ikkalasi ham kerak: o'quvchi guruhsiz ham fikr yozishi mumkin
// (umumiy shikoyat), guruh esa anonim fikrda yagona iz bo'lib qoladi
// (`isAnonymous` da author saqlanadi, lekin ko'rsatilmaydi).
// Bittasi bilan cheklansak, ikkinchi turdagi yozuvlar jimgina
// yo'qolardi yoki aksincha sizib chiqardi.
//
// HECH QAYSISIGA bog'lanmagan yozuv (anonim + guruhsiz) filial
// direktoriga KO'RINMAYDI - fail-closed, u markaz darajasidagi fikr.
const feedbackScopeFilter = async () => {
  // Ustun nomlari `groupId` / `authorId` (`group` / `author` bo'lsa
  // Prisma ularni RELATION filtri deb o'qib, boshqa ma'no berardi).
  const [groupScope, authorScope] = await Promise.all([
    branchGroupFilter("groupId"),
    branchUserFilter("authorId"),
  ]);

  // Ko'lam cheklanmagan (owner "barcha filiallar") - filtr shart emas.
  if (!groupScope.groupId && !authorScope.authorId) return {};

  const or = [];
  if (groupScope.groupId) or.push(groupScope);
  if (authorScope.authorId) or.push(authorScope);
  return { OR: or };
};

export const list = async ({
  type,
  status,
  search,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) => {
  const filter = { ...(await feedbackScopeFilter()) };
  if (type) filter.typeId = String(type);
  if (status) filter.status = status;
  // `$regex` + `escapeRegex` O'RNIGA `contains`: u XOM SATRNI qidiradi
  // va LIKE maxsus belgilarini o'zi ekranlaydi. Eski `escapeRegex` endi
  // hech nimadan himoya qilmasdi, faqat qidiruv matnini buzardi.
  if (search && search.trim()) {
    filter.message = { contains: search.trim(), mode: "insensitive" };
  }
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.gte = new Date(fromDate);
    if (toDate) filter.createdAt.lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        type: { select: TYPE_SELECT },
        group: { select: GROUP_SELECT },
        author: { select: USER_SELECT },
        repliedBy: { select: USER_SELECT },
      },
    }),
    prisma.feedback.count({ where: filter }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

export const getById = async (id) => {
  const doc = await prisma.feedback.findUnique({
    where: { id: String(id) },
    include: {
      type: { select: TYPE_SELECT },
      group: { select: GROUP_SELECT },
      author: { select: USER_SELECT },
      repliedBy: { select: USER_SELECT },
      reviewedBy: { select: USER_SELECT },
      resolvedBy: { select: USER_SELECT },
    },
  });
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  return withLegacyId(doc);
};

export const getMyFeedback = async (
  userId,
  { page = 1, limit = 20 } = {},
) => {
  const filter = { authorId: String(userId) };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        type: { select: TYPE_SELECT },
        group: { select: GROUP_SELECT },
        repliedBy: { select: USER_SELECT },
      },
    }),
    prisma.feedback.count({ where: filter }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

const assertCanTransition = (currentStatus, nextStatus) => {
  // Reverse transition (rejected/resolved → new) taqiqlanadi
  if (currentStatus === "rejected" || currentStatus === "resolved") {
    if (nextStatus === "new" || nextStatus === "in_review") {
      throw new ApiError(409, "Yopilgan feedback'ni qayta ochib bo'lmaydi");
    }
  }
};

const notifyStatusChangeAsync = async (feedback, action, currentUser) => {
  // `feedback.author` EMAS, `authorId`: bu funksiyaga `prisma.update`
  // natijasi keladi va u RELATION'ni o'z ichiga olmaydi (`include`
  // berilmagan). `author` bo'yicha tekshirilsa shart HAR DOIM `false`
  // chiqib, muallif holat o'zgarishi haqida XABAR OLMAY qolardi.
  if (!feedback?.authorId || feedback.isAnonymous) return;
  try {
    const { notifyFeedbackStatusChange } = await import(
      "../../notifications/services/notifications.service.js"
    );
    await notifyFeedbackStatusChange(
      feedback,
      {
        statusLabel: FEEDBACK_STATUS_LABEL[action] || action,
        adminReply: feedback.adminReply,
        rejectionReason: feedback.rejectionReason,
      },
      currentUser,
    );
  } catch {
    /* silent - notification fail bo'lsa feedback amal qaytmasin */
  }
};

export const markReviewed = async (id, currentUser) => {
  const doc = await prisma.feedback.findUnique({ where: { id: String(id) } });
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  if (doc.status !== "new") {
    throw new ApiError(
      409,
      "Faqat 'Yangi' holatdagi feedback'ni ko'rib chiqishga belgilash mumkin",
    );
  }
  // MONGO'DA BU `doc.save()` EDI (hujjatni o'zgartirib qayta yozish).
  // Prisma'da faqat berilgan maydonlar yangilanadi.
  const updated = await prisma.feedback.update({
    where: { id: doc.id },
    data: {
      status: "in_review",
      reviewedById: String(currentUser._id),
      reviewedAt: new Date(),
    },
  });
  await notifyStatusChangeAsync(updated, "in_review", currentUser);
  return getById(updated.id);
};

export const reply = async (id, body, currentUser) => {
  const doc = await prisma.feedback.findUnique({ where: { id: String(id) } });
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  const message = String(body.message || "").trim();
  if (!message) throw new ApiError(400, "Javob matni bo'sh bo'lmasligi kerak");

  const updated = await prisma.feedback.update({
    where: { id: doc.id },
    data: {
      adminReply: message,
      repliedById: String(currentUser._id),
      repliedAt: new Date(),
    },
  });
  return getById(updated.id);
};

export const resolve = async (id, body, currentUser) => {
  const doc = await prisma.feedback.findUnique({ where: { id: String(id) } });
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  assertCanTransition(doc.status, "resolved");

  const data = {
    status: "resolved",
    resolvedById: String(currentUser._id),
    resolvedAt: new Date(),
  };
  if (body?.adminReply !== undefined) {
    data.adminReply = String(body.adminReply || "").trim();
    // Javob matni bo'sh bo'lsa "kim javob berdi" ham yozilmaydi -
    // Mongo versiyasidagi shart bilan bir xil.
    if (data.adminReply) {
      data.repliedById = String(currentUser._id);
      data.repliedAt = new Date();
    }
  }
  const updated = await prisma.feedback.update({ where: { id: doc.id }, data });

  await notifyStatusChangeAsync(updated, "resolved", currentUser);
  return getById(updated.id);
};

export const reject = async (id, body, currentUser) => {
  const doc = await prisma.feedback.findUnique({ where: { id: String(id) } });
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  assertCanTransition(doc.status, "rejected");

  const reason = String(body?.rejectionReason || "").trim();
  if (!reason) throw new ApiError(400, "Rad etish sababi kerak");

  const updated = await prisma.feedback.update({
    where: { id: doc.id },
    data: {
      rejectionReason: reason,
      status: "rejected",
      resolvedById: String(currentUser._id),
      resolvedAt: new Date(),
    },
  });

  await notifyStatusChangeAsync(updated, "rejected", currentUser);
  return getById(updated.id);
};

export const getStats = async ({ fromDate, toDate } = {}) => {
  // Ro'yxat bilan AYNI ko'lam - aks holda kartochkadagi son ro'yxatdagi
  // qatorlar soniga to'g'ri kelmasdi (va boshqa filialni oshkor qilardi).
  const range = { ...(await feedbackScopeFilter()) };
  if (fromDate || toDate) {
    range.createdAt = {};
    if (fromDate) range.createdAt.gte = new Date(fromDate);
    if (toDate) range.createdAt.lte = new Date(toDate);
  }

  const [total, statusRows, typeRows] = await Promise.all([
    prisma.feedback.count({ where: range }),
    // Ikkala guruhlash ham `feedbacks` jadvalining O'Z ustuni bo'yicha -
    // `groupBy` yetarli.
    prisma.feedback.groupBy({
      by: ["status"],
      where: range,
      _count: { _all: true },
    }),
    prisma.feedback.groupBy({
      by: ["typeId"],
      where: range,
      _count: { _all: true },
      orderBy: { _count: { typeId: "desc" } },
    }),
  ]);

  // MONGO'DAGI `$lookup` O'RNIGA IKKINCHI SO'ROV. `groupBy` `include`
  // qabul qilmaydi, lekin bu yerda ehtiyoj ham yo'q: tur soni kichik.
  const typeIds = typeRows.map((r) => r.typeId).filter(Boolean);
  const types = typeIds.length
    ? await prisma.feedbackType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, name: true },
      })
    : [];
  const typeName = new Map(types.map((t) => [String(t.id), t.name]));

  return {
    total,
    // Javob shakli Mongo bilan BIR XIL (`{ _id, count }`) - klient
    // kartochkalari shunga tayangan.
    byStatus: statusRows.map((r) => ({ _id: r.status, count: r._count._all })),
    byType: typeRows.map((r) => ({
      typeId: r.typeId,
      name: typeName.get(String(r.typeId)),
      count: r._count._all,
    })),
  };
};

// Foydalanuvchi o'z feedback'iga kirishi mumkinligi
export const ensureOwnerOrAuthor = (feedback, user) => {
  if (user.role === "owner") return true;
  if (
    !feedback.isAnonymous &&
    feedback.author &&
    // `author` endi RELATION obyekti (`{ id }`) yoki `authorId` satri.
    String(feedback.author?.id || feedback.authorId || feedback.author) ===
      String(user._id)
  ) {
    return true;
  }
  throw new ApiError(403, "Ruxsat yo'q");
};

// `export { mongoose }` OLIB TASHLANDI: u "kelajakda kerak bo'lishi
// mumkin" deb qoldirilgan edi, lekin hech qayerda import qilinmagan.
// Prisma'ga o'tgach import ham yo'qoldi va eksport modulni yiqitardi.
