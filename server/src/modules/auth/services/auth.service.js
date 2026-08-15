import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { signAccess, signRefresh, verifyRefresh } from "../../../utils/jwt.js";
import {
  hashPassword,
  comparePassword,
} from "../../../helpers/password.helper.js";
import { resolveRole, hasPermission } from "../../../helpers/permission.helper.js";
import {
  resolveAllowedBranchIds,
  assertCanAssignBranch,
  ensureMainBranch,
} from "../../../helpers/branchAccess.helper.js";
import { getActiveBranchId } from "../../../helpers/branchContext.helper.js";
import { buildUserProfile } from "../../../helpers/userProfile.helper.js";
import { sha256 } from "../../../utils/hashToken.js";
import { withLegacyId } from "../../../utils/serialize.js";
import { normalizePhone, isPhoneLike } from "../../../utils/phone.js";
import { ROLES } from "../../../constants/roles.js";
import env from "../../../config/env.js";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import logger from "../../../config/logger.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const buildRefreshExpiry = () => new Date(Date.now() + REFRESH_TTL_MS);

export const issueTokens = async (user, { userAgent, ip }) => {
  const payload = { sub: String(user.id), role: user.role };
  const accessToken = signAccess(payload);
  const refreshToken = signRefresh(payload);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      userAgent,
      ip,
      expiresAt: buildRefreshExpiry(),
    },
  });

  return { accessToken, refreshToken };
};

// Prisma oddiy obyekt qaytaradi (Mongoose hujjati emas), shuning uchun
// `toJSON()` yo'q. Global `omit` tufayli passwordHash odatda umuman
// kelmaydi - lekin login oqimi uni ATAYLAB so'raydi, shuning uchun bu
// yerda yana bir bor olib tashlanadi (ikkinchi qulf).
export const sanitizeUser = (user) => {
  if (!user) return user;
  const { passwordHash, ...rest } = user;
  return withLegacyId(rest);
};

export const login = async ({ login, password, userAgent, ip }) => {
  const trimmed = String(login || "").trim();
  if (!trimmed) throw new ApiError(400, "Login kerak");

  const phone = isPhoneLike(trimmed) ? normalizePhone(trimmed) : null;
  const filters = [{ username: trimmed.toLowerCase() }];
  if (phone) filters.push({ phone });

  // `omit: { passwordHash: false }` - Mongoose'dagi `.select("+passwordHash")`
  // ning ekvivalenti. Xesh FAQAT shu yerda o'qiladi.
  const user = await prisma.user.findFirst({
    where: { OR: filters },
    omit: { passwordHash: false },
  });
  if (!user || !user.isActive || user.isDeleted) {
    throw new ApiError(401, "Login yoki parol noto'g'ri");
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) throw new ApiError(401, "Login yoki parol noto'g'ri");

  // MUZLATISH: roli muzlatilgan foydalanuvchi tizimga KIRA OLMAYDI.
  // Parol to'g'ri bo'lsa ham shu yerda to'xtatiladi.
  const role = await resolveRole(user.role);
  if (role.isFrozen) {
    throw new ApiError(
      403,
      role.frozenReason
        ? `Rolingiz muzlatilgan: ${role.frozenReason}`
        : "Sizning rolingiz muzlatilgan. Administratorga murojaat qiling",
    );
  }

  const { accessToken, refreshToken } = await issueTokens(user, {
    userAgent,
    ip,
  });

  // OXIRGI KIRISH. ATAYLAB shu yerda, issueTokens ichida EMAS: issueTokens
  // token yangilanganda ham chaqiriladi va maydon "oxirgi faollik"ka aylanib
  // qolardi. updateOne ishlatiladi (user.save() emas) - hujjat +passwordHash
  // bilan yuklangan, save() uni qayta validatsiya qilardi.
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(user),
    // Client login'dan keyin darhol to'g'ri sahifaga o'tishi uchun
    // (custom rolda landing sahifa ROLE_HOME map'ida yo'q).
    roleMeta: {
      value: role.value,
      label: role.label,
      roleType: role.roleType,
      defaultPath: role.defaultPath,
    },
  };
};

export const rotateRefresh = async ({ rawRefresh, userAgent, ip }) => {
  if (!rawRefresh) throw new ApiError(401, "Sessiya topilmadi");

  let payload;
  try {
    payload = verifyRefresh(rawRefresh);
  } catch {
    throw new ApiError(401, "Sessiya muddati tugagan");
  }

  const tokenHash = sha256(rawRefresh);
  const now = new Date();
  // POYGA XAVFSIZ (race-safe): shart ichida `revokedAt: null` turibdi,
  // shuning uchun ikkita parallel so'rovdan FAQAT BITTASI yozuvni yopa
  // oladi va `count === 1` oladi. Ikkinchisi 0 olib rad etiladi.
  //
  // Mongo'dagi findOneAndUpdate ham xuddi shu vazifani bajarardi -
  // Prisma'da atomik shartli yangilanish `updateMany` orqali beriladi.
  const revoked = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  });
  if (revoked.count !== 1) throw new ApiError(401, "Sessiya tugagan");

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.isDeleted) {
    throw new ApiError(401, "Foydalanuvchi topilmadi");
  }

  // MUZLATISH: sessiyani uzaytirishga ham yo'l qo'yilmaydi - eski refresh
  // yuqorida allaqachon revoke qilingan, ya'ni sessiya butunlay tugaydi.
  const role = await resolveRole(user.role);
  if (role.isFrozen) {
    throw new ApiError(401, "Sizning rolingiz muzlatilgan. Administratorga murojaat qiling");
  }

  const { accessToken, refreshToken } = await issueTokens(user, {
    userAgent,
    ip,
  });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
};

export const logout = async ({ rawRefresh }) => {
  if (!rawRefresh) return;
  const tokenHash = sha256(rawRefresh);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

/**
 * @param {object} user
 * @param {object} [ctx] - requireAuth hisoblagan filial konteksti.
 *   { effectiveRole, branchId } - filialga xos rol bo'lsa o'sha qaytadi,
 *   aks holda asosiy rol. Client shu ruxsatlar bo'yicha UI quradi, shuning
 *   uchun u serverdagi HAQIQIY ruxsatlar bilan bir xil bo'lishi SHART -
 *   aks holda tugma ko'rinadi-yu bosilganda 403 chiqardi.
 */
export const me = async (user, ctx = {}) => {
  const [baseRole, profile] = await Promise.all([
    resolveRole(user.role),
    buildUserProfile(user),
  ]);

  // Filialga xos rol (requireAuth bergan) ustunlikka ega.
  const role = ctx.effectiveRole || baseRole;

  // FILIAL: client filial tanlagichni shu ro'yxatdan quradi.
  // canSeeAllBranches=true bo'lsa "Barcha filiallar" varianti ko'rinadi.
  //
  // DIQQAT: ro'yxat ASOSIY rol ruxsatlari bilan hisoblanadi - foydalanuvchi
  // qaysi filialda turganidan qat'i nazar, o'zi kira oladigan BARCHA
  // filiallarni tanlagichda ko'rishi kerak.
  const readBranchState = async () => {
    const allowedIds = await resolveAllowedBranchIds(user, baseRole.permissions);
    const [list, total] = await Promise.all([
      allowedIds.length
        ? prisma.branch.findMany({
            where: { id: { in: allowedIds }, isDeleted: false, isActive: true },
            select: { id: true, name: true, code: true, isMain: true },
            // Mongo: .sort({ isMain: -1, name: 1 }) - asosiy filial birinchi.
            orderBy: [{ isMain: "desc" }, { name: "asc" }],
          })
        : [],
      prisma.branch.count({ where: { isDeleted: false, isActive: true } }),
    ]);
    // Klient `_id` kutadi (qarang: utils/serialize.js).
    return { list: list.map(withLegacyId), total };
  };

  let { list: branches, total: branchCount } = await readBranchState();

  // FILIALSIZ BAZA - O'Z-O'ZINI TIKLASH.
  //
  // Markazda kamida bitta filial bo'lishi INVARIANT (ensureMainBranch),
  // lekin u ilgari faqat server ko'tarilayotganda tekshirilardi. Baza
  // ishlab turgan server ostida tozalansa (`npm run db:reset`) markaz
  // filialsiz qolib, jarayon qayta ishga tushmaguncha TIQILIB turardi:
  // client bo'sh ro'yxatdan "Barcha filiallar" rejimini yasab, formalarda
  // TANLOVSIZ majburiy "Filial" maydonini ko'rsatardi - na lid, na guruh,
  // na xodim yaratib bo'lardi va sabab hech qayerda ko'rinmasdi.
  //
  // Tekshiruv aynan shu yerda: /auth/me har sessiyada baribir chaqiriladi
  // va filiallar soni ALLAQACHON o'qilyapti, ya'ni sog'lom holatda birorta
  // ham qo'shimcha so'rov qo'shilmaydi.
  if (branchCount === 0) {
    await ensureMainBranch();
    ({ list: branches, total: branchCount } = await readBranchState());
  }

  return {
    user: sanitizeUser(user),
    // Joriy filialdagi AMALDAGI rol (asosiy roldan farq qilishi mumkin).
    role: role.value || user.role,
    baseRole: user.role,
    permissions: role.permissions,
    branches,
    canSeeAllBranches: hasPermission(
      baseRole.permissions,
      PERMISSIONS.BRANCHES_VIEW_ALL,
    ),
    // Ko'p filialli rejim (server env). Client shu bayroqqa qarab filial
    // UI'sini butunlay yashiradi - bitta build ikkala rejimda ishlaydi,
    // shuning uchun bu VITE_ o'zgaruvchisi EMAS.
    multiBranch: env.MULTI_BRANCH,
    // Markazdagi JAMI filial (foydalanuvchi ko'lamidan qat'i nazar).
    // Yakka rejim yoqilgan-u, bazada bir nechta filial bo'lsa - client
    // ogohlantirish chizig'ini ko'rsatadi: hisobotlar faqat asosiy filialni
    // qamraydi, ega noto'g'ri raqamga ishonib qolmasligi kerak.
    branchCount,
    homeBranchId: user.homeBranchId ? String(user.homeBranchId) : null,
    // Client rolni hardcode qilmasligi uchun: landing sahifa va scope tipi
    // shu yerdan keladi (ROLE_HOME map o'rniga).
    roleMeta: {
      value: role.value,
      label: role.label,
      roleType: role.roleType,
      defaultPath: role.defaultPath,
      isSystem: role.exists ? role.isSystem : true,
      permissionsVersion: role.permissionsVersion,
    },
    profile,
  };
};

export const updateProfile = async (currentUser, body) => {
  const userId = currentUser.id || currentUser._id;
  const exists = await prisma.user.findUnique({ where: { id: userId } });
  if (!exists) throw new ApiError(404, "Foydalanuvchi topilmadi");

  // Faqat KELGAN maydonlar yoziladi. Mongoose'da bu `user.x = ...` +
  // `save()` bilan bo'lardi; Prisma'da `data` obyektini shu tarzda
  // yig'amiz - berilmagan maydon umuman tegilmaydi.
  const data = {};

  // Telefon takrorlanishi BLOKLANMAYDI (qarang: prisma/schema.prisma dagi
  // User.phone izohi - unique EMAS).
  if (body.phone !== undefined) {
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");
    data.phone = phone || null;
  }

  if (body.firstName !== undefined) data.firstName = body.firstName.trim();
  if (body.lastName !== undefined) data.lastName = body.lastName.trim();
  if (body.birthDate !== undefined) {
    data.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  }
  if (body.gender !== undefined) data.gender = body.gender || null;

  const user = await prisma.user.update({ where: { id: userId }, data });
  return sanitizeUser(user);
};

export const changePassword = async (currentUser, { currentPassword, newPassword }) => {
  const userId = currentUser.id || currentUser._id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    omit: { passwordHash: false },
  });
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");

  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(400, "Joriy parol noto'g'ri");

  // Parolni yangilash va eski sessiyalarni yopish BITTA TRANZAKSIYADA.
  //
  // Mongo'da bu ikki alohida so'rov edi va oradagi xato "parol o'zgardi,
  // lekin eski sessiyalar tirik" degan xavfli holatni qoldirardi.
  // PostgreSQL tranzaksiyasi bunga yo'l qo'ymaydi - migratsiyaning
  // ochiq yutug'i.
  const newHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
};

export const registerUser = async (body, scope = {}) => {
  const phone = body.phone ? normalizePhone(body.phone) : null;
  if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");

  const username = String(body.username).toLowerCase().trim();

  // TELEFON TAKRORLANISHI RUXSAT ETILADI (qarang: user.model.js phone izohi).
  // Login (username) esa hamon yagona - u autentifikatsiya kaliti.
  const usernameTaken = await prisma.user.findUnique({ where: { username } });
  if (usernameTaken) {
    throw new ApiError(409, "Bunday login (username) allaqachon mavjud");
  }

  if (![ROLES.TEACHER, ROLES.STUDENT].includes(body.role)) {
    throw new ApiError(400, "Noto'g'ri rol");
  }

  // FILIAL MAJBURIY.
  //
  // Foydalanuvchi HECH QACHON filialsiz yaratilmasligi kerak: filialsiz
  // odam userBranchCondition() qoidasi bo'yicha faqat view_all egalariga
  // ko'rinadi, ya'ni "umumiy"da osilib qoladi va o'z filialida yo'q
  // bo'lardi. "Barcha filiallar" rejimida yaratishga urinilsa - xato,
  // chunki qaysi filialga yozishni bilib bo'lmaydi.
  const homeBranchId = body.homeBranchId || getActiveBranchId() || null;
  if (!homeBranchId) {
    throw new ApiError(
      400,
      "Filial tanlanmagan. Foydalanuvchi qo'shish uchun avval aniq filialni tanlang",
    );
  }

  // IMTIYOZ OSHIRISHDAN HIMOYA: filial ochiq berilgan bo'lsa (client
  // "Barcha filiallar" rejimida tanlagan), u chaqiruvchining O'Z ko'lamida
  // ekani tekshiriladi. Aks holda bir filial direktori boshqa filialga
  // odam qo'shib, keyin uning parolini o'qib olardi.
  assertCanAssignBranch(
    scope.allowedBranchIds,
    scope.canSeeAllBranches,
    homeBranchId,
  );

  const passwordHash = await hashPassword(body.password);

  const doc = {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    username,
    phone: phone || null,
    passwordHash,
    role: body.role,
    isActive: true,
    birthDate: body.birthDate ? new Date(body.birthDate) : null,
    homeBranchId,
  };

  if (body.role === ROLES.STUDENT) {
    // Jins faqat o'quvchi uchun saqlanadi (o'qituvchida yo'q).
    doc.gender = body.gender || null;
    // Kalendar kuni sifatida saqlanadi (UTC-midnight) - "bugun" ham mahalliy
    // (Asia/Tashkent) kun bo'yicha, aks holda 00:00-05:00 oralig'ida kechagi kun tushardi.
    doc.enrolledAt = body.enrolledAt ? parseLocalDay(body.enrolledAt) : localTodayMidnight();
  }

  if (body.role === ROLES.TEACHER) {
    doc.hiredAt = body.hiredAt ? parseLocalDay(body.hiredAt) : localTodayMidnight();
  }

  const user = await prisma.user.create({ data: doc });

  // ISHGA OLISHDA MAOSH (ikki bosqichli formaning 2-qadami).
  //
  // Best-effort: stavkadagi xato XODIM YARATILISHINI bekor QILMAYDI - u
  // allaqachon saqlangan va bu yerda tranzaksiya yo'q. Xato bo'lsa
  // o'qituvchi "maoshi belgilanmagan" holatda qoladi va profil sahifasida
  // ogohlantirish ko'rinadi - bu "keyinroq belgilayman" bilan bir xil holat.
  if (body.role === ROLES.TEACHER && body.compensation) {
    try {
      const compensationService = await import(
        "../../teacherSalary/services/teacherCompensation.service.js"
      );
      await compensationService.setCompensation(
        {
          ...body.compensation,
          teacher: user.id,
          branchId: homeBranchId,
          // Stavka ishga olingan kundan boshlanadi (aks holda oradagi
          // kunlar stavkasiz qolib, maosh 0 chiqardi).
          effectiveFrom: body.compensation.effectiveFrom || doc.hiredAt,
        },
        { _id: scope.userId || null },
      );
    } catch (err) {
      logger.warn(
        { err, userId: user.id },
        "Ishga olishda maosh stavkasi belgilanmadi - profil orqali kiritish kerak",
      );
    }
  }

  // ─── BOSHLANG'ICH QOLDIQ ───
  //
  // Odam tizimga kirishidan OLDINGI qarzdorlik. Shu yerda yozilishi
  // MUHIM: keyingi barcha hisob-kitob (oylik qarz, maosh, to'lov) shu
  // nuqtadan boshlanadi.
  //
  // XATO ODAM YARATILISHINI BEKOR QILMAYDI: u allaqachon saqlangan va
  // bu yerda tranzaksiya yo'q. Lekin PUL jimgina yo'qolmasligi kerak,
  // shuning uchun xato javobga `openingBalanceError` bo'lib qaytadi va
  // owner uni /api/opening-balance orqali qayta kiritadi.
  const result = sanitizeUser(user);
  if (body.openingBalance) {
    try {
      const openingBalanceService = await import(
        "../../openingBalance/services/openingBalance.service.js"
      );
      await openingBalanceService.create(
        {
          user: user.id,
          role: body.role,
          amount: body.openingBalance,
          branchId: homeBranchId,
          // Guruh HALI YO'Q: o'quvchi qarzi guruhga qo'shilishni kutadi.
          group: null,
          joinedAt: doc.enrolledAt || null,
          note: body.openingBalanceNote || "",
        },
        { currentUser: { _id: scope.userId || null } },
      );
    } catch (err) {
      logger.error(
        { err, userId: user.id, amount: body.openingBalance },
        "Boshlang'ich qoldiq yozilmadi - qo'lda kiritish kerak",
      );
      result.openingBalanceError =
        "Boshlang'ich qoldiq yozilmadi. Uni profil sahifasidan qayta kiriting.";
    }
  }

  return result;
};
