import User from "../../../models/user.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import TeacherGroupPeriod from "../../../models/teacherGroupPeriod.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import Group from "../../../models/group.model.js";
import ArchiveReason from "../../../models/archiveReason.model.js";
import RefreshToken from "../../../models/refreshToken.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { normalizePhone } from "../../../utils/phone.js";
import { hashPassword } from "../../../helpers/password.helper.js";
import { buildUserProfile } from "../../../helpers/userProfile.helper.js";
import { toUtcMidnight, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import { assertPeriodInvariants } from "../../../helpers/period.helper.js";
import { safeRecomputeStudentCompletion } from "../../../helpers/studentCompletion.helper.js";
import {
  findUserBlockingRelations,
  purgeUserResidualData,
  hardDeleteStudentData,
  hardDeleteTeacherData,
} from "../../../helpers/userRelations.helper.js";
import { logAction as logArchiveAction } from "../../archiveReasons/services/archiveReasons.service.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import * as studentFreezeService from "../../studentFreeze/services/studentFreeze.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";
import * as systemNotificationsService from "../../systemNotifications/services/systemNotifications.service.js";
import { runFinanceTxn } from "../../finance/services/financeTxn.helper.js";
import logger from "../../../config/logger.js";

const STUDENT_ONLY_FIELDS = ["enrolledAt", "completedAt"];
const TEACHER_ONLY_FIELDS = ["hiredAt"];

// O'qituvchining FAOL guruhi bo'lsa arxivlash/faolsizlantirishni bloklaydi.
// Ikkala manba tekshiriladi: Group.teachers keshi (UI shuni ko'rsatadi) VA ochiq
// dars davri (TeacherGroupPeriod) - biror-birida bo'lsa ham bloklanadi. Avval
// o'qituvchini boshqa (bo'sh vaqti mos) o'qituvchiga almashtirish yoki guruhdan
// chiqarish kerak.
const assertTeacherHasNoActiveGroup = async (user, actionVerb = "arxivlang") => {
  if (!user || user.role !== ROLES.TEACHER) return;
  const openPeriods = await TeacherGroupPeriod.find(
    { teacher: user._id, endDate: null, isDeleted: { $ne: true } },
    { group: 1 },
  ).lean();
  const activeGroups = await Group.find(
    {
      $or: [
        { teachers: user._id },
        { _id: { $in: openPeriods.map((p) => p.group) } },
      ],
      isActive: true,
      isDeleted: { $ne: true },
    },
    { name: 1 },
  ).lean();
  if (activeGroups.length) {
    const names = activeGroups.map((g) => g.name).join(", ");
    throw new ApiError(
      400,
      `O'qituvchining faol guruhi bor (${names}). Avval uni boshqa o'qituvchiga almashtiring yoki guruh(lar)dan chiqaring, so'ng ${actionVerb}.`,
    );
  }
};

// Ro'yxatda saralash mumkin bo'lgan maydonlar (xavfsiz oq ro'yxat).
const USER_SORT_FIELDS = {
  createdAt: "createdAt",
  firstName: "firstName",
  lastName: "lastName",
};

// O'quvchilar ro'yxatiga faol guruhlarni qo'shadi -
// ro'yxatdan profil ochmasdan ko'rinishi uchun (at-a-glance).
const enrichStudents = async (items) => {
  const studentIds = items
    .filter((u) => u.role === ROLES.STUDENT)
    .map((u) => u._id);
  if (studentIds.length === 0) return items.map((u) => u.toObject());

  const [membershipRows, freezeMap] = await Promise.all([
    GroupMembership.find({
      student: { $in: studentIds },
      leftAt: null,
    })
      .populate("group", { name: 1 })
      .lean(),
    studentFreezeService.getActiveFreezeMap(studentIds),
  ]);

  const groupsMap = new Map();
  for (const m of membershipRows) {
    if (!m.group) continue;
    const key = String(m.student);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push({ _id: m.group._id, name: m.group.name });
  }

  return items.map((u) => {
    const obj = u.toObject();
    if (u.role === ROLES.STUDENT) {
      obj.activeGroups = groupsMap.get(String(u._id)) || [];
      const fr = freezeMap.get(String(u._id));
      obj.isFrozen = !!fr;
      obj.frozenSince = fr ? fr.startDate : null;
    }
    return obj;
  });
};

export const list = async ({
  role,
  search,
  status = "active",
  page = 1,
  limit = 20,
  sort = "createdAt",
  order = "desc",
}) => {
  // status: "active" → faqat faol, "archived" → faqat arxiv,
  // "frozen" → hozir muzlatilgan (faol o'quvchilar ichida), "all" → hammasi.
  const filter = { isDeleted: { $ne: true } };
  if (status === "active") filter.isActive = true;
  else if (status === "archived") filter.isActive = false;
  else if (status === "frozen") {
    filter.isActive = true;
    filter._id = { $in: await studentFreezeService.getActiveFrozenStudentIds() };
  }
  // Rol berilsa - o'sha rol; berilmasa ("Hammasi") - faqat o'quvchi/o'qituvchi
  // (owner Foydalanuvchilar ro'yxatida ko'rsatilmaydi).
  filter.role = role || { $in: [ROLES.STUDENT, ROLES.TEACHER] };

  if (search && search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [
      { firstName: rx },
      { lastName: rx },
      { username: rx },
      { phone: rx },
    ];
  }

  const dir = order === "asc" ? 1 : -1;
  const skip = (page - 1) * limit;

  const sortField = USER_SORT_FIELDS[sort] || "createdAt";
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ [sortField]: dir })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  const enriched = await enrichStudents(items);
  return { items: enriched, total, page, limit };
};

export const getById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  return user;
};

export const getProfile = async (id) => {
  const user = await getById(id);
  return buildUserProfile(user);
};

export const update = async (id, body) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini tahrirlab bo'lmaydi");
  }

  // Role-conditional maydonlar
  if (user.role !== ROLES.STUDENT) {
    for (const f of STUDENT_ONLY_FIELDS) {
      if (body[f] !== undefined) {
        throw new ApiError(400, `Bu maydon (${f}) faqat o'quvchi uchun`);
      }
    }
  }
  if (user.role !== ROLES.TEACHER) {
    for (const f of TEACHER_ONLY_FIELDS) {
      if (body[f] !== undefined) {
        throw new ApiError(400, `Bu maydon (${f}) faqat o'qituvchi uchun`);
      }
    }
  }

  // Asosiy maydonlar
  if (body.firstName !== undefined) user.firstName = body.firstName.trim();
  if (body.lastName !== undefined) user.lastName = body.lastName.trim();
  if (body.isActive !== undefined) {
    // O'quvchini faolsizlantirib (arxivlab) bo'lmaydi - u doim faol obyekt.
    if (body.isActive === false && user.role === ROLES.STUDENT) {
      throw new ApiError(
        400,
        "O'quvchini arxivlab bo'lmaydi. \"Muzlatish\"dan foydalaning yoki guruhdan chiqaring.",
      );
    }
    // Faolsizlantirish ham arxivlash kabi - faol guruhi bor o'qituvchiga ruxsat yo'q.
    if (body.isActive === false) await assertTeacherHasNoActiveGroup(user, "arxivlang");
    user.isActive = !!body.isActive;
  }

  if (body.phone !== undefined) {
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");
    user.phone = phone || undefined;
  }

  // Profil maydonlari (har qanday rol uchun)
  if (body.birthDate !== undefined) {
    user.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  }
  if (body.gender !== undefined) {
    user.gender = body.gender || null;
  }

  // Student-specific
  let recomputeCompletion = false;
  if (user.role === ROLES.STUDENT) {
    if (body.enrolledAt !== undefined) {
      const d = body.enrolledAt ? new Date(body.enrolledAt) : null;
      if (d && d.getTime() > Date.now()) {
        throw new ApiError(400, "Ro'yxatga olingan sana kelajakda bo'lmasin");
      }
      user.enrolledAt = d;
    }

    // Yakunlash sanasi: bo'sh → avtoga qaytarish, sana → qo'lda override.
    if (body.completedAt !== undefined) {
      const d = body.completedAt ? toUtcMidnight(body.completedAt) : null;
      if (d) {
        if (d.getTime() > Date.now()) {
          throw new ApiError(400, "Yakunlash sanasi kelajakda bo'lmasin");
        }
        if (user.enrolledAt && d.getTime() < toUtcMidnight(user.enrolledAt).getTime()) {
          throw new ApiError(400, "Yakunlash sanasi ro'yxatga olingan sanadan oldin bo'lmasin");
        }
        user.completedAt = d;
        user.completedAtManual = true;
      } else {
        user.completedAt = null;
        user.completedAtManual = false;
        recomputeCompletion = true;
      }
    }
  }

  // Teacher-specific
  if (user.role === ROLES.TEACHER) {
    if (body.hiredAt !== undefined) {
      // Ishga olingan sana o'qituvchi uchun MAJBURIY - bo'shatib bo'lmaydi.
      if (!body.hiredAt) {
        throw new ApiError(400, "Ishga olingan sana majburiy");
      }
      const d = new Date(body.hiredAt);
      if (d.getTime() > Date.now()) {
        throw new ApiError(400, "Ishga olingan sana kelajakda bo'lmasin");
      }
      user.hiredAt = d;
    }
  }

  await user.save();
  // Override bo'shatilgan bo'lsa - avtomatik qiymatni qayta hisoblaymiz.
  if (recomputeCompletion) {
    await safeRecomputeStudentCompletion(user._id);
    return getById(id);
  }
  return user;
};

// Owner uchun: login va parolni qaytaradi. Parol OCHIQ MATNDA saqlanadi,
// shu sababli to'g'ridan-to'g'ri o'qib ko'rsatiladi.
export const getPassword = async (id) => {
  const user = await User.findById(id).select("username role +passwordHash");
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini ko'rib bo'lmaydi");
  }
  return { username: user.username, password: user.passwordHash || "" };
};

// Owner uchun: foydalanuvchiga yangi parol o'rnatish (javobda bir martalik qaytadi)
export const setPassword = async (id, newPassword) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini o'zgartirib bo'lmaydi");
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  // Parol o'zgargach barcha eski sessiyalarni bekor qilamiz
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return { username: user.username, password: newPassword };
};

export const softRemove = async (id, { reasonId, archiveDate, by } = {}) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }
  // O'quvchi arxivlanmaydi - u tizimda doim faol obyekt bo'lib qoladi.
  // Vaqtincha to'xtatish uchun "Muzlatish" (StudentFreeze) ishlatiladi, chiqib
  // ketish esa guruhdan chiqarish (GroupMembership.leftAt) orqali qayd etiladi.
  if (user.role === ROLES.STUDENT) {
    throw new ApiError(
      400,
      "O'quvchini arxivlab bo'lmaydi. Vaqtincha to'xtatish uchun \"Muzlatish\"dan foydalaning yoki guruhdan chiqaring.",
    );
  }

  // Arxiv sanasi - berilsa o'sha kun (UTC midnight), aks holda mahalliy "bugun".
  const archivedAt = archiveDate
    ? toUtcMidnight(archiveDate)
    : localTodayMidnight();
  if (archivedAt.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Arxiv sanasi kelajakda bo'lishi mumkin emas");
  }

  // O'quvchi arxivlansa - faol a'zoliklarni arxiv sanasida yopamiz.
  if (user.role === ROLES.STUDENT) {
    if (user.enrolledAt && archivedAt.getTime() < toUtcMidnight(user.enrolledAt).getTime()) {
      throw new ApiError(400, "Arxiv sanasi ro'yxatga olingan sanadan oldin bo'lishi mumkin emas");
    }

    const memberships = await GroupMembership.find({
      student: user._id,
      leftAt: null,
      isDeleted: { $ne: true },
    });

    // Avval arxiv sanasi har bir faol davr bilan to'qnashmasligini tekshiramiz -
    // hech narsa saqlamasdan (atomik: bittasi xato bo'lsa umuman arxivlanmaydi).
    for (const m of memberships) {
      if (archivedAt.getTime() < toUtcMidnight(m.joinedAt).getTime()) {
        throw new ApiError(
          400,
          "Arxiv sanasi o'quvchining guruhga qo'shilgan sanasidan oldin bo'lishi mumkin emas",
        );
      }
      const otherMems = await GroupMembership.find(
        { group: m.group, student: user._id, _id: { $ne: m._id }, isDeleted: { $ne: true } },
        { joinedAt: 1, leftAt: 1 },
      ).lean();
      assertPeriodInvariants(
        { startDate: toUtcMidnight(m.joinedAt), endDate: archivedAt },
        otherMems.map((o) => ({ startDate: o.joinedAt, endDate: o.leftAt })),
        "date",
      );
    }

    user.isActive = false;
    user.archivedAt = archivedAt;
    await user.save();

    // Chiqish sababini a'zolikka ham snapshot bilan yozamiz, shunda retention
    // ("Chiqib ketish tahlili") hisoboti shu o'quvchini to'g'ri sabab bo'yicha
    // sanaydi - aks holda u "Sababsiz" guruhiga tushib qoladi.
    let leftReasonDetail = null;
    let leftReasonTitle = "";
    if (reasonId) {
      const reason = await ArchiveReason.findById(reasonId, { title: 1 }).lean();
      if (reason) {
        leftReasonDetail = reason._id;
        leftReasonTitle = reason.title;
      }
    }

    for (const m of memberships) {
      m.leftAt = archivedAt;
      m.leftReason = "removed";
      m.leftReasonDetail = leftReasonDetail;
      m.leftReasonTitle = leftReasonTitle;
      await m.save();
    }
    // Yopilgan a'zoliklar bo'yicha to'lovlar leftAt bilan qayta proratsiya bo'lsin (C1)
    try {
      await financePaymentService.recalcForStudent(user._id);
    } catch (err) {
      logger.warn({ err }, "Arxivlashda o'quvchi to'lovlari qayta hisoblanmadi");
    }
    // Yakunlash sanasi arxiv sanasiga ko'ra avto-belgilanadi (manual override bo'lmasa).
    await safeRecomputeStudentCompletion(user._id);
    try {
      await logArchiveAction({
        user: user._id,
        action: "archive",
        reasonId,
        by: by?._id,
      });
    } catch {
      // log yozilmasa ham arxivlash buzilmasin
    }
  } else {
    // O'qituvchining faol guruhi bo'lsa arxivlab bo'lmaydi (almashtirish/chiqarish kerak).
    await assertTeacherHasNoActiveGroup(user, "arxivlang");

    user.isActive = false;
    user.archivedAt = archivedAt;
    await user.save();
  }

  return user;
};

export const restore = async (id, { reasonId, by } = {}) => {
  const user = await getById(id);
  user.isActive = true;
  user.archivedAt = null;
  await user.save();

  if (user.role === ROLES.STUDENT) {
    // archivedAt olib tashlangach yakunlash sanasi a'zolik tarixiga ko'ra qayta
    // hisoblanadi (faol a'zolik yo'q bo'lsa max leftAt'da qoladi).
    await safeRecomputeStudentCompletion(user._id);
    try {
      await logArchiveAction({
        user: user._id,
        action: "restore",
        reasonId,
        by: by?._id,
      });
    } catch {
      // log yozilmasa ham qaytarish buzilmasin
    }
  }

  return user;
};

// Butunlay (hard) o'chirish - hujjat va bog'liq ma'lumotlar TIKLAB BO'LMAYDIGAN
// tarzda drop qilinadi. O'QUVCHI ham, O'QITUVCHI ham cascade hard-delete qilinadi:
//  - O'quvchi: to'lov, depozit, a'zolik, davomat, baho... o'chadi.
//  - O'qituvchi: maosh hisoblari, maosh to'lovlari (chiqim), dars davrlari, HR
//    davomat/yo'qliklar o'chadi; guruhlar va ular ichidagi o'quvchilar saqlanadi
//    (bu o'qituvchi Group.teachers keshidan olib tashlanadi).
// Ikkalasi uchun ham tasdiqlash uchun to'liq ism ({confirmName}) talab etiladi;
// so'ng ta'sirlangan guruh maoshlari qayta hisoblanadi. Owner o'chirilmaydi.
export const permanentRemove = async (id, currentUser, { confirmName } = {}) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }

  const isStudent = user.role === ROLES.STUDENT;
  const isTeacher = user.role === ROLES.TEACHER;

  // O'qituvchini o'chirish sharti: (1) faol guruhi bo'lmasin, (2) to'lanmagan
  // (olmagan) oyliklari bo'lmasin.
  if (isTeacher) {
    await assertTeacherHasNoActiveGroup(user, "o'chiring");
    const owed = await TeacherSalary.exists({
      teacher: user._id,
      isDeleted: { $ne: true },
      $expr: { $lt: ["$paidAmount", "$expectedAmount"] },
    });
    if (owed) {
      throw new ApiError(
        400,
        "O'qituvchining to'lanmagan (olmagan) oyliklari bor. Avval maoshlarni to'liq to'lang, so'ng o'chiring.",
      );
    }
  }

  // O'quvchini o'chirish sharti: hech qanday guruhga biriktirilmagan bo'lsin (faol
  // a'zolik bo'lmasin). Guruhda bo'lsa - avval guruhdan chiqarish kerak.
  if (isStudent) {
    const inGroup = await GroupMembership.exists({
      student: user._id,
      leftAt: null,
      isDeleted: { $ne: true },
    });
    if (inGroup) {
      throw new ApiError(
        400,
        "O'quvchi guruhga biriktirilgan. Avval uni guruh(lar)dan chiqaring, so'ng o'chiring.",
      );
    }
  }

  if (isStudent || isTeacher) {
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    if (!confirmName || confirmName.trim() !== fullName) {
      throw new ApiError(
        400,
        "Tasdiqlash uchun foydalanuvchining to'liq ismini to'g'ri kiriting",
      );
    }

    // Barcha o'chirishlarni bitta tranzaksiyada (replica set yo'q bo'lsa - sessiyasiz).
    const groupIds = await runFinanceTxn(async (session) => {
      const gids = isStudent
        ? await hardDeleteStudentData(user._id, { session })
        : await hardDeleteTeacherData(user._id, { session });
      await purgeUserResidualData(user._id, { session });
      await User.deleteOne(
        { _id: user._id },
        session ? { session } : undefined,
      );
      return gids;
    });

    // Moliyaviy izchillik uchun ta'sirlangan guruh maoshlarini qayta hisoblaymiz:
    //  - O'quvchi o'chsa: guruh kirimi (groupRevenue) kamayadi → o'qituvchi
    //    maoshlari qayta hisoblanishi SHART (aks holda maosh bazasi xato qoladi).
    //  - O'qituvchi o'chsa: qolgan o'qituvchilar maoshi o'zaro bog'liq emas, shu
    //    sababli bu recalc amalda no-op - lekin xavfsizlik uchun (self-healing) qoldiriladi.
    for (const groupId of groupIds) {
      try {
        await teacherSalaryService.recalcForGroup(groupId);
      } catch (err) {
        logger.warn(
          { err, groupId },
          "Foydalanuvchi o'chirilgach guruh maoshlari qayta hisoblanmadi",
        );
      }
    }

    // Owner uchun tizim bildirishnomasi (best-effort).
    const roleLabel = isStudent ? "o'quvchi" : "o'qituvchi";
    try {
      await systemNotificationsService.create({
        message: `${fullName} (${roleLabel}) tizimdan butunlay o'chirildi`,
      });
    } catch {
      // bildirishnoma yozilmasa ham o'chirish buzilmasin
    }

    return { _id: user._id };
  }

  // Kutilmagan rollar (himoya): bog'liqlik bo'lsa o'chirib bo'lmaydi.
  const blockers = await findUserBlockingRelations(user._id);
  if (blockers.length > 0) {
    const detail = blockers.map((b) => `${b.label} (${b.count})`).join(", ");
    throw new ApiError(
      409,
      `Bu foydalanuvchini butunlay o'chirib bo'lmaydi: u quyidagi ma'lumotlarga bog'liq — ${detail}. Avval bu yozuvlarni o'chiring yoki foydalanuvchini arxivlang.`,
      { code: "USER_HAS_RELATIONS", details: blockers },
    );
  }

  // Bog'liqlik yo'q - qoldiq sessiya/audit ma'lumotini tozalab, hujjatni o'chiramiz.
  await purgeUserResidualData(user._id);
  await User.deleteOne({ _id: user._id });
  return { _id: user._id };
};

export const studentHistory = async (
  studentId,
  { page = 1, limit = 20 } = {},
) => {
  const user = await getById(studentId);
  if (user.role !== ROLES.STUDENT) {
    throw new ApiError(400, "Bu foydalanuvchi o'quvchi emas");
  }
  const filter = { student: studentId };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    GroupMembership.find(filter)
      .sort({ joinedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("group", { name: 1, schedule: 1 })
      .populate("transferredTo", { name: 1 }),
    GroupMembership.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
