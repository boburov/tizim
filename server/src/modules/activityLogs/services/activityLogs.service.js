import ActivityLog from "../../../models/activityLog.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { describeLog } from "../../../constants/auditActions.js";
import { branchUserFilter } from "../../../helpers/branchContext.helper.js";

const USER_PROJECTION = { firstName: 1, lastName: 1, role: 1, username: 1 };

// Middleware endi bu yo'llarni yozmaydi, lekin bazada eski yozuvlar qolgan.
// Ularni o'qish bosqichida ham chiqarib tashlaymiz (ma'lumot o'chirilmaydi).
const NOISE_PATHS = ["/api/auth/refresh", "/auth/refresh"];

const withNoiseFilter = (filter) => ({
  ...filter,
  path: { $nin: NOISE_PATHS },
});

// "action" - hosila qiymat, bazada saqlanmaydi. Uni to'g'ridan-to'g'ri
// filtrlash uchun har bir amal turini bazadagi maydonlarga tarjima qilamiz,
// aks holda sahifalash (pagination) buziladi.
const LOGIN_PATHS = ["/api/auth/login", "/api/bot-auth/login"];
const LOGOUT_PATHS = ["/api/auth/logout"];

const ACTION_QUERY = {
  CREATE: { method: "POST", path: { $nin: [...LOGIN_PATHS, ...LOGOUT_PATHS] } },
  UPDATE: { method: { $in: ["PATCH", "PUT"] } },
  DELETE: { method: "DELETE" },
  LOGIN: { path: { $in: LOGIN_PATHS } },
  LOGOUT: { path: { $in: LOGOUT_PATHS } },
};

// path shartlari to'qnashmasligi uchun $and ichida birlashtiramiz
const withActionFilter = (filter, action) => {
  const clause = ACTION_QUERY[action];
  if (!clause) return filter;
  return { $and: [filter, clause] };
};

// Mongo hujjatiga semantik maydonlarni qo'shadi (action, description, failed)
const enrich = (doc) => {
  const plain = doc.toJSON ? doc.toJSON() : doc;
  return { ...plain, ...describeLog(plain) };
};

export const list = async ({
  userId,
  method,
  action,
  resourceType,
  fromDate,
  toDate,
  page = 1,
  limit = 30,
}) => {
  // FILIAL KO'LAMI: ActivityLog'da `branchId` YO'Q - yozuv AKTYORGA
  // (`user`) tegishli, aktyor esa filialga.
  //
  // Ilgari bu yerda hech qanday filtr yo'q edi va A filial direktori
  // B filial xodimlarining barcha amallarini (kim nima o'zgartirgani,
  // qaysi endpoint'ga borgani) ko'rardi. branchLeak testi buni
  // ko'rsatmasdi, chunki u ActivityLog yozuvi umuman YARATMASDI -
  // bo'sh natija "toza" deb hisoblanardi.
  //
  // TIZIM yozuvlari (user: null) filial direktoriga KO'RINMAYDI -
  // fail-closed. Markaz darajasidagi audit owner'ning ishi.
  const filter = { ...(await branchUserFilter("user")) };
  if (userId) filter.user = userId;
  if (method) filter.method = method;
  if (resourceType) filter.resourceType = resourceType;
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const query = withActionFilter(withNoiseFilter(filter), action);

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", USER_PROJECTION),
    ActivityLog.countDocuments(query),
  ]);

  return { items: items.map(enrich), total, page, limit };
};

export const getById = async (id) => {
  const doc = await ActivityLog.findById(id).populate("user", USER_PROJECTION);
  if (!doc) throw new ApiError(404, "Log topilmadi");
  return enrich(doc);
};

export const getStats = async ({ fromDate, toDate } = {}) => {
  // Ro'yxat bilan AYNI ko'lam. Aggregate'da mongoose hook'lari
  // ishlamaydi, shuning uchun $match'ga qo'lda qo'shiladi.
  const match = { ...(await branchUserFilter("user")) };
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) match.createdAt.$lte = new Date(toDate);
  }

  const [total, byMethod, byResource, topUsers] = await Promise.all([
    ActivityLog.countDocuments(match),
    ActivityLog.aggregate([
      { $match: match },
      { $group: { _id: "$method", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ActivityLog.aggregate([
      { $match: match },
      { $group: { _id: "$resourceType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    ActivityLog.aggregate([
      // DIQQAT - `$and` ISHLATILADI, spread EMAS.
      //
      // `{ ...match, user: { $ne: null } }` yozilsa, `user` kaliti IKKI
      // marta uchraydi va keyingisi FILIAL FILTRINI jimgina bosib
      // ketardi (branchUserFilter ham aynan `user` bo'yicha filtrlaydi).
      // Natijada "eng faol foydalanuvchilar" kartochkasi butun markaz
      // bo'yicha hisoblanardi - ro'yxat toza bo'lsa-da.
      { $match: { $and: [match, { user: { $ne: null } }] } },
      { $group: { _id: "$user", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: User.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          role: "$user.role",
          count: 1,
        },
      },
    ]),
  ]);

  return { total, byMethod, byResource, topUsers };
};
