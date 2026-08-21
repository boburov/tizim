import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { describeLog } from "../../../constants/auditActions.js";
import { branchUserFilter } from "../../../helpers/branchContext.helper.js";
import { withLegacyId } from "../../../utils/serialize.js";

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  username: true,
};

// Middleware endi bu yo'llarni yozmaydi, lekin bazada eski yozuvlar qolgan.
// Ularni o'qish bosqichida ham chiqarib tashlaymiz (ma'lumot o'chirilmaydi).
const NOISE_PATHS = ["/api/auth/refresh", "/auth/refresh"];

// "action" - hosila qiymat, bazada saqlanmaydi. Uni to'g'ridan-to'g'ri
// filtrlash uchun har bir amal turini bazadagi maydonlarga tarjima qilamiz,
// aks holda sahifalash (pagination) buziladi.
const LOGIN_PATHS = ["/api/auth/login", "/api/bot-auth/login"];
const LOGOUT_PATHS = ["/api/auth/logout"];

const ACTION_QUERY = {
  CREATE: {
    method: "POST",
    path: { notIn: [...LOGIN_PATHS, ...LOGOUT_PATHS] },
  },
  UPDATE: { method: { in: ["PATCH", "PUT"] } },
  DELETE: { method: "DELETE" },
  LOGIN: { path: { in: LOGIN_PATHS } },
  LOGOUT: { path: { in: LOGOUT_PATHS } },
};

/**
 * `where` ni yig'ish.
 *
 * ═══════════════════════════════════════════════════════════════════
 * `AND` MAJBURIY, SPREAD EMAS.
 *
 * Shovqin filtri ham, amal filtri ham `path` bo'yicha shart qo'yadi.
 * Ular bitta obyektga spread qilinsa `path` kaliti IKKI marta uchraydi
 * va keyingisi oldingisini JIMGINA bosib ketardi - masalan "LOGIN"
 * tanlanganda shovqin filtri yo'qolardi.
 *
 * Xuddi shu sabab `branchUserFilter` ham `AND` ichida turadi: u
 * `userId` bo'yicha filtrlaydi va `userId` filtri bilan to'qnashardi
 * (Mongo versiyasidagi izohga qarang - u yerda ham aynan shu tuzoq
 * bo'lgan).
 * ═══════════════════════════════════════════════════════════════════
 */
const buildWhere = async ({
  userId,
  method,
  action,
  resourceType,
  fromDate,
  toDate,
}) => {
  const and = [];

  // FILIAL KO'LAMI: ActivityLog'da `branchId` YO'Q - yozuv AKTYORGA
  // (`userId`) tegishli, aktyor esa filialga.
  //
  // Ilgari bu yerda hech qanday filtr yo'q edi va A filial direktori
  // B filial xodimlarining barcha amallarini ko'rardi.
  //
  // TIZIM yozuvlari (userId: null) filial direktoriga KO'RINMAYDI -
  // fail-closed. Markaz darajasidagi audit owner'ning ishi.
  //
  // MAYDON NOMI `user` EMAS, `userId`: Prisma'da `user` bu RELATION.
  const scope = await branchUserFilter("userId");
  if (Object.keys(scope).length) and.push(scope);

  // Shovqin (refresh) - doim chiqarib tashlanadi.
  and.push({ path: { notIn: NOISE_PATHS } });

  if (userId) and.push({ userId: String(userId) });
  if (method) and.push({ method });
  if (resourceType) and.push({ resourceType });

  if (fromDate || toDate) {
    const createdAt = {};
    if (fromDate) createdAt.gte = new Date(fromDate);
    if (toDate) createdAt.lte = new Date(toDate);
    and.push({ createdAt });
  }

  const clause = ACTION_QUERY[action];
  if (clause) and.push(clause);

  return { AND: and };
};

// Yozuvga semantik maydonlarni qo'shadi (action, description, failed)
const enrich = (doc) => ({ ...withLegacyId(doc), ...describeLog(doc) });

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
  const where = await buildWhere({
    userId,
    method,
    action,
    resourceType,
    fromDate,
    toDate,
  });

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { user: { select: USER_SELECT } },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { items: items.map(enrich), total, page, limit };
};

/**
 * XAVFSIZLIK TUZATISHI — FILIAL KO'LAMI QO'SHILDI.
 *
 * Ilgari bu yerda HECH QANDAY ko'lam yo'q edi: `activity_logs.read`
 * ruxsati bor har kim ISTALGAN logni id bo'yicha o'qiy olardi, `list`
 * va `getStats` esa `branchUserFilter` bilan CHEKLANGAN edi.
 *
 * O'LCHANDI (taxmin emas): filialga biriktirilgan aktyor uchun
 *   • `GET /activity-logs?userId=<begona>` → 0 ta qator (ro'yxat ko'lamli)
 *   • `GET /activity-logs/<o'sha logning id'si>` → 200 (log to'liq berildi)
 * Ikkala stekda ham AYNAN shunday edi.
 *
 * Ya'ni ro'yxat yashirgan yozuvni id bilan o'qib olish mumkin edi —
 * klassik IDOR. Ko'lam qoidasi `list` BILAN AYNI (`branchUserFilter`),
 * shuning uchun bu "yangi siyosat" emas, mavjud siyosatni qoldirib
 * ketilgan joyga qo'llash.
 *
 * ⚠ KO'LAMDAN TASHQARI LOG UCHUN 404 ("Log topilmadi"), 403 EMAS:
 * 403 yozuv MAVJUDLIGINI tasdiqlardi va id bo'yicha sanab chiqishga
 * yo'l ochardi. Mavjud bo'lmagan id ham AYNI 404 ni beradi.
 */
export const getById = async (id) => {
  const scope = await branchUserFilter("userId");
  const doc = await prisma.activityLog.findFirst({
    where: Object.keys(scope).length
      ? { AND: [{ id: String(id) }, scope] }
      : { id: String(id) },
    include: { user: { select: USER_SELECT } },
  });
  if (!doc) throw new ApiError(404, "Log topilmadi");
  return enrich(doc);
};

export const getStats = async ({ fromDate, toDate } = {}) => {
  // Ro'yxat bilan AYNI ko'lam (shovqin filtridan tashqari - statistika
  // xom hisob, Mongo versiyasida ham shunday edi).
  const and = [];
  const scope = await branchUserFilter("userId");
  if (Object.keys(scope).length) and.push(scope);
  if (fromDate || toDate) {
    const createdAt = {};
    if (fromDate) createdAt.gte = new Date(fromDate);
    if (toDate) createdAt.lte = new Date(toDate);
    and.push({ createdAt });
  }
  const where = and.length ? { AND: and } : {};

  const [total, byMethodRows, byResourceRows, topRows] = await Promise.all([
    prisma.activityLog.count({ where }),
    // Ikkala guruhlash ham `activity_logs` jadvalining O'Z ustunlari
    // bo'yicha - `groupBy` yetarli, raw SQL kerak emas.
    prisma.activityLog.groupBy({
      by: ["method"],
      where,
      _count: { _all: true },
      orderBy: { _count: { method: "desc" } },
    }),
    prisma.activityLog.groupBy({
      by: ["resourceType"],
      where,
      _count: { _all: true },
      orderBy: { _count: { resourceType: "desc" } },
      take: 15,
    }),
    prisma.activityLog.groupBy({
      by: ["userId"],
      // `userId: { not: null }` — ustun NULLABLE, ya'ni bu ruxsat
      // etilgan. TIZIM yozuvlari "eng faol foydalanuvchi" bo'la
      // olmaydi.
      where: { AND: [...and, { userId: { not: null } }] },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 5,
    }),
  ]);

  // MONGO'DAGI `$lookup` O'RNIGA IKKINCHI SO'ROV.
  //
  // Eng faol beshta foydalanuvchi topilgach ularning ismini olib
  // kelamiz. `$lookup` ni Prisma'da takrorlash mumkin emas
  // (`groupBy` `include` qabul qilmaydi), lekin bu yerda ehtiyoj ham
  // yo'q: qatorlar soni BESHTA bilan cheklangan.
  const topIds = topRows.map((r) => r.userId).filter(Boolean);
  const users = topIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topIds } },
        select: { id: true, firstName: true, lastName: true, role: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [String(u.id), u]));

  return {
    total,
    // Javob shakli Mongo bilan BIR XIL: `{ _id, count }` - klient
    // jadvallari shunga tayangan.
    byMethod: byMethodRows.map((r) => ({ _id: r.method, count: r._count._all })),
    byResource: byResourceRows.map((r) => ({
      _id: r.resourceType,
      count: r._count._all,
    })),
    topUsers: topRows.map((r) => {
      const u = userMap.get(String(r.userId));
      return {
        userId: r.userId,
        firstName: u?.firstName || "",
        lastName: u?.lastName || "",
        role: u?.role || "",
        count: r._count._all,
      };
    }),
  };
};
