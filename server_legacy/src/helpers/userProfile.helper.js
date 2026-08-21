import prisma from "../config/prisma.js";
import { withLegacyId } from "../utils/serialize.js";
import { ROLES } from "../constants/roles.js";
import { botStatusOf, BOT_STATUS } from "./botStatus.helper.js";
import { resolveRole } from "./permission.helper.js";
import {
  list as listGroups,
  findAllActiveForStudent,
  findPendingRemovalNotice,
} from "../modules/groups/services/groups.service.js";

const calcYears = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let years =
    today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) {
    years -= 1;
  }
  return years >= 0 ? years : null;
};

const sanitizeUser = (user) => {
  if (!user) return user;
  const { passwordHash, ...rest } = user;
  return withLegacyId(rest);
};

// Bog'lanish MA'LUMOTI (kim) va bog'lanish HOLATI (yetadimi) - ikki xil
// savol. Ilgari faqat birinchisi qaytardi, shuning uchun profil sahifasi
// "Telegram: @user" deb turaverardi, xabar esa aslida yetmasdi.
const fetchTelegram = async (userId) => {
  const bot = await prisma.botUser.findFirst({ where: { userId } });
  if (!bot) return null;
  return {
    // telegramId BigInt (Postgres) - JSON.stringify uni seriyalay olmaydi
    // va javob 500 bilan yiqilardi. Klient uni raqam sifatida kutadi.
    telegramId: Number(bot.telegramId),
    username: bot.username,
    firstName: bot.firstName,
    lastName: bot.lastName,
    languageCode: bot.languageCode,
    isBlocked: !!bot.isBlocked,
    lastSeenAt: bot.lastSeenAt || null,
    status: botStatusOf(bot),
  };
};

export const buildUserProfile = async (userInput) => {
  let user = userInput;
  // HUJJAT emasmi (satr yoki ObjectId) - bazadan olamiz.
  //
  // `_bsontype === "ObjectID"` ni SOLISHTIRMAYMIZ: bson 5 dan boshlab
  // uning qiymati "ObjectId" (kichik "d"). Eski tekshiruv hech qachon
  // to'g'ri kelmasdi, ObjectId hujjatga aylanmay o'tib ketardi va
  // quyida `base.roleLabel = ...` da TypeError chiqardi.
  //
  // Endi shakl bo'yicha tekshiramiz: `role` maydoni bor narsa - hujjat.
  // Bu bson versiyasiga umuman bog'liq emas.
  if (!user || typeof user !== "object" || user.role === undefined) {
    user = await prisma.user.findUnique({ where: { id: String(user) } });
  }
  if (!user) return null;

  const base = sanitizeUser(user);

  // ROL YORLIG'I. Client'da rol nomlari qattiq yozilgan ro'yxatdan olinadi
  // (ROLE_LABELS), custom rollar esa u yerda HECH QACHON bo'lmaydi -
  // "direktor" profil sarlavhasida xom qiymat bo'lib, qizil "noma'lum rol"
  // nishoni bilan chiqardi. Yorliqni serverdan beramiz (resolveRole 5
  // daqiqalik keshda - qo'shimcha so'rov amalda yo'q).
  const roleMeta = await resolveRole(user.role);
  base.roleLabel = roleMeta.label;
  base.roleType = roleMeta.roleType;
  base.roleIsFrozen = Boolean(roleMeta.isFrozen);

  const telegram = await fetchTelegram(user.id);
  // `telegram` null bo'lishi mumkin (bog'lanmagan), `botStatus` esa HAR
  // DOIM bor: UI "bog'lanmagan"ni ham holat sifatida ko'rsatishi kerak,
  // shuning uchun uni har safar `telegram?.x` bilan chiqarish o'rniga
  // tayyor maydon beramiz.
  const botStatus = telegram?.status || BOT_STATUS.NOT_LINKED;

  if (user.role === ROLES.STUDENT) {
    const activeGroups = await findAllActiveForStudent(user.id);

    // Guruhdan chiqarilgan bo'lsa - login qilganda bir marta xabar (modal) uchun.
    const removalNotice = await findPendingRemovalNotice(user.id);

    // Davomat summary (joriy oy) - lazy import (circular dependency oldini olish)
    const { getStudentSummary: getAttSummary } = await import(
      "../modules/attendance/services/attendance.service.js"
    );
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const attendanceSummary = await getAttSummary(user.id, {
      fromDate: monthStart,
      toDate: monthEnd,
    });

    // Muzlatish holati (hozir muzlatilganmi) - lazy import (circular oldini olish)
    const { getActiveFreeze } = await import(
      "../modules/studentFreeze/services/studentFreeze.service.js"
    );
    const activeFreeze = await getActiveFreeze(user.id);

    return {
      ...base,
      activeGroups,
      attendanceSummary,
      removalNotice,
      isFrozen: !!activeFreeze,
      activeFreeze: activeFreeze || null,
      telegram,
      botStatus,
    };
  }

  if (user.role === ROLES.TEACHER) {
    const { items } = await listGroups({
      teacherId: user.id,
      page: 1,
      limit: 100,
    });
    const groups = items.map((g) => ({
      _id: g._id,
      name: g.name,
      schedule: g.schedule,
      studentsCount: g.studentsCount || 0,
    }));

    return {
      ...base,
      age: calcYears(user.birthDate),
      years: calcYears(user.hiredAt),
      groups,
      telegram,
      botStatus,
    };
  }

  // Owner yoki boshqa rollar - minimal profile
  return {
    ...base,
    age: calcYears(user.birthDate),
    telegram,
    botStatus,
  };
};
