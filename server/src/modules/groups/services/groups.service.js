import prisma from "../../../config/prisma.js";
import { attachBotStatus } from "../../../helpers/botStatus.helper.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import {
  toUtcMidnight,
  localTodayMidnight,
  scheduleActiveOn,
} from "../../../helpers/attendance.helper.js";
import {
  branchFilter,
  branchGroupFilter,
  resolveBranchForWrite,
  resolveBranchFromGroup,
} from "../../../helpers/branchContext.helper.js";
import { restoreGroup as cascadeRestoreGroup } from "../../../helpers/cascadeDelete.helper.js";
import { hardDeleteGroupData } from "../../../helpers/userRelations.helper.js";
import { runFinanceTxn } from "../../finance/services/financeTxn.helper.js";
import logger from "../../../config/logger.js";
import * as financeGroupFeeService from "../../finance/services/groupFee.service.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";
import * as teacherGroupPeriodService from "./teacherGroupPeriod.service.js";
import * as depositService from "../../deposits/services/deposit.service.js";
import * as openingBalanceService from "../../openingBalance/services/openingBalance.service.js";
import * as systemNotificationsService from "../../systemNotifications/services/systemNotifications.service.js";
import { assertPeriodInvariants } from "../../../helpers/period.helper.js";
import { safeRecomputeStudentCompletion } from "../../../helpers/studentCompletion.helper.js";

// ═══════════════════════════════════════════════════════════════════════
// GURUH SERVISI - MONGO → PRISMA
//
// UCHTA TUB O'ZGARISH (qolgani mexanik):
//
// 1) `Group.teachers` — MASSIV emas, KO'P-KO'PGA BOG'LANISH.
//    `(group.teachers || []).map(String)` endi har element uchun
//    "[object Object]" berardi va jadval to'qnashuvi tekshiruvi JIMGINA
//    o'tib ketardi (o'qituvchi ikki joyda band bo'lardi). Shuning uchun
//    ID'lar `teacherIdsOf()` orqali olinadi, yozish esa `set`/`connect`.
//
// 2) `Group.schedule` — EMBEDDED massiv emas, ALOHIDA JADVAL
//    (GroupScheduleItem). Har bir o'qishda ochiq `include` qilinishi
//    SHART: unutilsa `scheduleActiveOn()` bo'sh massiv ko'radi va
//    "guruhda dars yo'q" degan jimgina noto'g'ri natija chiqadi -
//    soatbay maosh 0 ga tushadi, to'qnashuv tekshiruvi hech nimani
//    tutmaydi. Yozish - `deleteMany` + `create` (versiya almashtirish).
//
// 3) `archivedClosedPeriods` / `archivedClosedMemberships` — SKALYAR
//    `String[]` (relation EMAS). Ularga `doc._id` yozish `undefined`
//    beradi va kursni qayta ochganda HECH NARSA tiklanmasdi: o'qituvchi
//    biriktirilmagan (maosh yo'q), o'quvchilar bitirgan (qarz yo'q),
//    guruh esa aktiv ko'rinardi.
//
// MOLIYAVIY YON TA'SIRLAR: guruh o'zgarishi maosh/to'lov qayta hisobini
// KELTIRIB CHIQARADI. Qaysi chaqiruv MAJBURIY (xato yuqoriga chiqadi),
// qaysi biri best-effort (log) ekani AYNAN Mongo variantidagidek qoldi -
// har biri o'z joyida izohlangan.
// ═══════════════════════════════════════════════════════════════════════

export const safeUserProjection = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
  role: true,
  isActive: true,
};

// Jadval qatorlari - `scheduleActiveOn()` va `getClassDaysInRange()` shunga tayanadi.
const SCHEDULE_SELECT = {
  select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
};

// Guruhni to'liq o'qish uchun standart shakl. `schedule` va `teachers`
// HAR DOIM shu yerdan keladi - ularni unutish jimgina buzadi (yuqoridagi izoh).
const GROUP_INCLUDE = {
  schedule: { ...SCHEDULE_SELECT, orderBy: { effectiveFrom: "asc" } },
  teachers: { select: safeUserProjection },
};

const actorId = (u) => u?.id || u?._id || null;

// Ko'p-ko'pga bog'lanishdan ID ro'yxati. Mongo'da bu oddiy massiv edi.
const teacherIdsOf = (group) => (group?.teachers || []).map((t) => t.id ?? t).map(String);

// Guruh javobini eski (Mongoose) shakliga keltiradi.
const shapeGroup = (group) => {
  if (!group) return group;
  const out = withLegacyId(group);
  // Client `group.teachers[i]._id` o'qiydi - withLegacyId ichkariga ham kiradi.
  return out;
};

// Yozuv amallari uchun: guruh mavjud + aktiv bo'lishi shart. Arxivlangan bo'lsa
// aniq xabar beradi (avval read-only edi - chalg'ituvchi 404). Read yo'llari
// (getById/list/restore) guruhni TO'G'RIDAN-TO'G'RI o'qiydi.
// FILIAL KO'LAMI shu YAGONA nuqtada - fayl bo'ylab o'nlab joyda ishlatiladi.
const ensureGroup = async (groupId) => {
  const group = await prisma.group.findFirst({
    where: { id: String(groupId), ...branchFilter() },
    include: GROUP_INCLUDE,
  });
  if (!group || group.isDeleted) throw new ApiError(404, "Guruh topilmadi");
  // Tugagan kurs (isActive=false yoki endDate o'tgan - kunlik job-gacha oyna).
  const ended =
    group.endDate &&
    toUtcMidnight(group.endDate).getTime() <= localTodayMidnight().getTime();
  if (!group.isActive || ended) {
    throw new ApiError(
      400,
      "Kurs tugagan. Davom ettirish uchun tugash sanasini o'zgartiring.",
    );
  }
  return group;
};

const ensureStudent = async (studentId) => {
  const user = await prisma.user.findUnique({
    where: { id: String(studentId) },
    select: {
      id: true,
      role: true,
      isActive: true,
      isDeleted: true,
      enrolledAt: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!user || user.role !== ROLES.STUDENT || !user.isActive || user.isDeleted) {
    throw new ApiError(400, "O'quvchi topilmadi");
  }
  return user;
};

const ensureTeachers = async (teacherIds) => {
  if (!teacherIds || teacherIds.length === 0) return;
  // Guruhda ko'pi bilan bitta o'qituvchi bo'lishi mumkin - o'qituvchi faqat
  // "Almashtirish" orqali o'zgartiriladi, qo'shilmaydi.
  if (teacherIds.length > 1) {
    throw new ApiError(400, "Guruhda faqat bitta o'qituvchi bo'lishi mumkin");
  }
  const ids = teacherIds.map(String);
  const count = await prisma.user.count({
    where: { id: { in: ids }, role: ROLES.TEACHER, isActive: true, isDeleted: false },
  });
  if (count !== ids.length) {
    throw new ApiError(400, "Bir yoki bir nechta o'qituvchi noto'g'ri");
  }
};

export const list = async ({
  search,
  teacherId,
  archived = false,
  page = 1,
  limit = 20,
}) => {
  // FILIAL ko'lami - `branchFilter()` allaqachon Prisma shaklini beradi.
  const where = {
    ...branchFilter(),
    isActive: archived ? false : true,
    isDeleted: false,
  };
  // Ko'p-ko'pga: Mongo'da `{ teachers: id }` edi.
  if (teacherId) where.teachers = { some: { id: String(teacherId) } };
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }

  const skip = (page - 1) * limit;

  // Joriy oy (kartochkada oylik to'lovni ko'rsatish uchun)
  const today = localTodayMidnight();
  const curYear = today.getUTCFullYear();
  const curMonth = today.getUTCMonth() + 1;

  // Mongo'da bu uchta `$lookup` bo'lgan aggregation quvuri edi. Prisma'da:
  //   • o'qituvchilar   → `include`
  //   • faol o'quvchilar soni → filtrlangan `_count` (bitta so'rovda)
  //   • joriy oy narxi  → alohida bitta so'rov (N+1 emas: bir marta,
  //                        sahifadagi barcha guruh ID'lari bo'yicha)
  const [rows, total] = await Promise.all([
    prisma.group.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        ...GROUP_INCLUDE,
        _count: {
          select: { memberships: { where: { leftAt: null, isDeleted: false } } },
        },
      },
    }),
    prisma.group.count({ where }),
  ]);

  const ids = rows.map((g) => g.id);
  const fees = ids.length
    ? await prisma.groupFee.findMany({
        where: { groupId: { in: ids }, year: curYear, month: curMonth },
        select: { groupId: true, amount: true },
      })
    : [];
  const feeByGroup = new Map(fees.map((f) => [f.groupId, f.amount]));

  const items = rows.map((g) => {
    const { _count, ...rest } = g;
    return shapeGroup({
      ...rest,
      monthlyFee: feeByGroup.has(g.id) ? feeByGroup.get(g.id) : null,
      studentsCount: _count.memberships,
    });
  });

  return { items, total, page, limit };
};

// Berilgan user obyektlariga Telegram ma'lumotini VA yetkazish holatini
// (`botStatus`) bitta so'rovda biriktiradi.
//
// Holat ham qaytishi SHART: o'qituvchi guruh ro'yxatida kimga xabar
// yetmasligini ko'rishi kerak. Ilgari faqat "bog'langanmi" ma'lumoti
// qaytardi va botni BLOKLAGAN o'quvchi bog'langanlar qatorida turaverardi.
const attachTelegram = attachBotStatus;

export const getById = async (id) => {
  // FILIAL: boshqa filial guruhining to'liq tafsiloti (o'quvchilar, telefon,
  // Telegram ID) ochilib ketmasin. 404 - mavjudligini ham oshkor qilmaymiz.
  const group = await prisma.group.findFirst({
    where: { id: String(id), ...branchFilter() },
    include: GROUP_INCLUDE,
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  const memberships = await prisma.groupMembership.findMany({
    where: { groupId: group.id, leftAt: null, isDeleted: false },
    include: { student: { select: safeUserProjection } },
    orderBy: { joinedAt: "asc" },
  });

  const students = memberships
    .filter((m) => m.student)
    .map((m) => ({
      membershipId: m.id,
      joinedAt: m.joinedAt,
      ...withLegacyId(m.student),
    }));

  const groupJson = shapeGroup(group);

  // Telegram ma'lumotini o'quvchilar va o'qituvchilarga biriktiramiz
  await Promise.all([
    attachTelegram(students),
    attachTelegram(groupJson.teachers || []),
  ]);

  return {
    ...groupJson,
    students,
    studentsCount: students.length,
  };
};

// Jadval slotlaridagi effectiveFrom ni UTC-yarim tunga normalizatsiya qiladi
// (yoki null). dropEffective=true bo'lsa - effectiveFrom butunlay null qilinadi
// (yangi guruh: tarix yo'q, hamma slot boshidan amal qiladi).
const normalizeSchedule = (schedule, { dropEffective = false } = {}) =>
  (schedule || []).map((s) => ({
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    effectiveFrom:
      dropEffective || !s.effectiveFrom ? null : toUtcMidnight(s.effectiveFrom),
  }));

// (kun+vaqt) bo'yicha jadval to'plamini taqqoslash uchun kalit (effectiveFrom'siz)
const slotSetKey = (slots) =>
  (slots || [])
    .map((s) => `${s.day}-${s.startTime}-${s.endTime}`)
    .sort()
    .join("|");

// Versiyalash birlashtiruvi: yangi jadval joriy amaldagi versiyaga TENG bo'lsa -
// eski jadvalni o'zgarishsiz qaytaramiz. Farq qilsa - eski (tarixiy) qatorlarni
// saqlab, yangi qatorlarni effectiveFrom (default - bugun) bilan ustiga qo'shamiz.
// Shunday qilib o'tgan sanalar eski versiya, yangi sanalar yangi versiya bo'yicha
// hisoblanadi (BUG-4: tarixiy dars soni shishmaydi).
//
// `null` QAYTSA - "o'zgarish yo'q", ya'ni chaqiruvchi jadvalga UMUMAN
// tegmaydi. Bu Prisma'da muhim: `deleteMany + create` bejiz ishga tushsa
// qatorlarning ID'lari almashib, keraksiz yozuv sodir bo'lardi.
const mergeScheduleVersion = (existing, incoming, effectiveFromInput) => {
  const incomingClean = normalizeSchedule(incoming, { dropEffective: true });
  const existingArr = existing || [];

  // Joriy (bugun) amaldagi versiya bilan solishtiramiz
  const currentActive = scheduleActiveOn(existingArr);
  if (slotSetKey(currentActive) === slotSetKey(incomingClean)) {
    return null; // o'zgarish yo'q - tarixga tegmaymiz
  }

  const effectiveFrom = effectiveFromInput
    ? toUtcMidnight(effectiveFromInput)
    : localTodayMidnight();
  const effTs = effectiveFrom.getTime();

  // Aynan shu effectiveFrom ga ega eski qatorlarni olib tashlaymiz - bir kunda
  // bir necha marta tahrirlansa yangi versiya eskisini ALMASHTIRADI (dublikat
  // (kun+vaqt+effectiveFrom) bo'lib unique indeks rad etmasligi uchun).
  const kept = existingArr.filter((s) => {
    const ts = s.effectiveFrom ? toUtcMidnight(s.effectiveFrom).getTime() : null;
    return ts !== effTs;
  });

  // Eski (tarixiy) qatorlar saqlanadi, yangi versiya effectiveFrom bilan ustiga
  // qo'shiladi. scheduleActiveOn (eng so'nggi effectiveFrom <= sana) tufayli
  // o'tgan sanalar eski, yangi sanalar yangi versiya bo'yicha hisoblanadi.
  const newVersion = incomingClean.map((s) => ({ ...s, effectiveFrom }));
  return [...kept, ...newVersion].map((s) => ({
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    effectiveFrom: s.effectiveFrom ? toUtcMidnight(s.effectiveFrom) : null,
  }));
};

// KURS: global katalog, faqat mavjudligi va faolligi tekshiriladi.
// null = biriktirilmagan (ruxsat etilgan - eski/aralash guruhlar).
const assertCourseExists = async (courseId) => {
  if (!courseId) return;
  const course = await prisma.course.findUnique({
    where: { id: String(courseId) },
    select: { isActive: true },
  });
  if (!course) throw new ApiError(400, "Kurs topilmadi");
  if (!course.isActive) throw new ApiError(400, "Nofaol kursni biriktirib bo'lmaydi");
};

// XONA: FILIAL resursi. Guruh bilan BIR filialda bo'lishi SHART.
//
// Aks holda A filial guruhi B filialning xonasini "band qilib" qo'yardi:
// B ning bandlik hisobi soxta band ko'rsatardi, A niki esa bo'sh - ya'ni
// ikkala filialning ham utilization raqami yolg'on bo'lardi.
const assertRoomInBranch = async (roomId, branchId) => {
  if (!roomId) return;
  const room = await prisma.room.findFirst({
    where: { id: String(roomId), isDeleted: false },
    select: { branchId: true, isActive: true, name: true },
  });
  if (!room) throw new ApiError(400, "Xona topilmadi");
  if (!room.isActive) throw new ApiError(400, "Nofaol xonani biriktirib bo'lmaydi");
  if (String(room.branchId) !== String(branchId)) {
    throw new ApiError(400, "Xona guruh bilan bir xil filialda bo'lishi kerak");
  }
};

export const create = async (body, currentUser) => {
  await ensureTeachers(body.teachers);
  // O'qituvchi ishga olingan sanasi guruh boshlanish sanasidan KEYIN bo'lsa -
  // biriktirib bo'lmaydi (guruh boshlanganda o'qituvchi hali ishga qabul qilinmagan).
  const gStart = body.startDate ? toUtcMidnight(body.startDate) : null;
  if (gStart && body.teachers?.length) {
    const tDocs = await prisma.user.findMany({
      where: { id: { in: body.teachers.map(String) } },
      select: { hiredAt: true, firstName: true, lastName: true },
    });
    for (const t of tDocs) {
      if (t.hiredAt && toUtcMidnight(t.hiredAt).getTime() > gStart.getTime()) {
        const nm = `${t.firstName} ${t.lastName || ""}`.trim();
        throw new ApiError(
          400,
          `${nm}ning ishga olingan sanasi guruh boshlanish sanasidan keyin - bu o'qituvchini biriktirib bo'lmaydi`,
        );
      }
    }
  }
  // Jadval to'qnashuvi: o'qituvchi bir vaqtda ikkita guruhda dars bera olmaydi.
  for (const teacherId of body.teachers || []) {
    // eslint-disable-next-line no-await-in-loop
    await teacherGroupPeriodService.assertTeacherScheduleFree(
      teacherId,
      body.schedule,
      null,
    );
  }
  // FILIAL: guruh filial ko'lamining ildizi - davomat/to'lov/maosh
  // shu guruh orqali filialga bog'lanadi. "Barcha filiallar" rejimida
  // client formada aniq filialni so'raydi va `branchId` bilan yuboradi.
  const branchId = await resolveBranchForWrite(currentUser, body.branchId);

  // KURS va XONA.
  //
  // Kurs GLOBAL katalog, shuning uchun faqat mavjudligi tekshiriladi.
  // Xona esa FILIAL resursi: u guruh bilan BIR filialda bo'lishi shart.
  await assertCourseExists(body.courseId);
  await assertRoomInBranch(body.roomId, branchId);

  const group = await prisma.group.create({
    data: {
      branchId,
      courseId: body.courseId || null,
      roomId: body.roomId || null,
      name: body.name.trim(),
      // Jadval endi ALOHIDA jadval - ichma-ich `create` bilan bitta amalda.
      schedule: {
        create: normalizeSchedule(body.schedule, { dropEffective: true }),
      },
      // teachers - davrlardan HOSILA kesh; assignTeacher syncGroupTeachersCache qiladi.
      // Ko'p-ko'pga bog'lanishda "bo'sh" degani - hech kimni ulamaslik.
      startDate: body.startDate ? toUtcMidnight(body.startDate) : null,
      endDate: body.endDate ? toUtcMidnight(body.endDate) : null,
      durationMonths: body.durationMonths ?? null,
      // Berilmasa sxemadagi standart ("prorated") qoladi.
      ...(body.entryBilling ? { entryBilling: body.entryBilling } : {}),
    },
    include: GROUP_INCLUDE,
  });

  const today = localTodayMidnight();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;

  // Guruh yaratilishi bilanoq joriy oy uchun to'lov (GroupFee) yozuvini
  // ta'minlaymiz (best-effort) - aks holda Moliya sahifasida to'lov hali
  // o'quvchi qo'shilmaguncha "Belgilanmagan" bo'lib qolardi. Narx berilgan
  // bo'lsa - o'sha summa bilan (manual), aks holda 0 (auto).
  try {
    if (body.monthlyPrice != null) {
      await financeGroupFeeService.upsert({
        groupId: group.id,
        year,
        month,
        amount: body.monthlyPrice,
      });
    } else {
      await financeGroupFeeService.ensureGroupFee(group.id, year, month);
    }
  } catch (err) {
    logger.warn({ err }, "Yangi guruh uchun oylik to'lov yaratilmadi");
  }

  // O'qituvchilarni dars berish DAVRI sifatida biriktiramiz (manba haqiqati).
  // assignTeacher ochiq davr ochib, teachers keshini sinxronlaydi.
  const startDate = group.startDate || today;
  for (const teacherId of body.teachers || []) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await teacherGroupPeriodService.assignTeacher(group.id, teacherId, { startDate });
    } catch (err) {
      // O'QITUVCHISIZ GURUH QOLIB KETMASIN.
      //
      // Ilgari bu xato faqat logga tushardi: server 201 qaytarib "Guruh
      // yaratildi" derdi, guruh esa o'qituvchisiz - davomat ham, maosh ham
      // ishlamaydigan holatda qolardi. Foydalanuvchi ko'rgani esa eng yomon
      // holat: xabar "yaratildi" deydi, amalda guruh yaroqsiz.
      //
      // Guruh yaratish - BITTA amal. Biriktirish yiqilsa endigina
      // yaratilgan guruhni butunlay orqaga qaytaramiz (u hali hech qayerda
      // ishlatilmagan: a'zolik ham, davomat ham yo'q) va xatoni AYNAN
      // sababi bilan qaytaramiz.
      try {
        // eslint-disable-next-line no-await-in-loop
        await hardDeleteGroupData(group.id);
        // eslint-disable-next-line no-await-in-loop
        await prisma.groupScheduleItem.deleteMany({ where: { groupId: group.id } });
        // eslint-disable-next-line no-await-in-loop
        await prisma.group.update({ where: { id: group.id }, data: { teachers: { set: [] } } });
        // eslint-disable-next-line no-await-in-loop
        await prisma.group.delete({ where: { id: group.id } });
      } catch (cleanupErr) {
        // Tozalash yiqilsa ham ASL xatoni yashirmaymiz.
        logger.error(
          { err: cleanupErr, groupId: String(group.id) },
          "Yiqilgan guruh yaratishni orqaga qaytarib bo'lmadi",
        );
      }
      throw err instanceof ApiError
        ? err
        : new ApiError(
            400,
            err?.message || "O'qituvchini guruhga biriktirib bo'lmadi",
          );
    }

    // Maosh yozuvi - IKKILAMCHI: yiqilsa ham guruh yaroqli qoladi, yozuv
    // keyingi hisoblashda o'zi yaratiladi. Shuning uchun bu yerda faqat log.
    try {
      // eslint-disable-next-line no-await-in-loop
      await teacherSalaryService.ensureSalaryForTeacherGroup(
        teacherId,
        group.id,
        year,
        month,
      );
    } catch (err) {
      logger.warn({ err }, "Guruh o'qituvchisi uchun maosh yozuvi yaratilmadi");
    }
  }

  // endDate berilgan bo'lsa hayot-tsiklni moslaymiz (o'tgan sana → darhol arxiv).
  if (group.endDate) {
    await reconcileGroupEnd(await loadGroup(group.id));
  }

  return shapeGroup(await loadGroup(group.id));
};

// Ichki: guruhni to'liq shakl bilan o'qish (filial filtri YO'Q - chaqiruvchi
// allaqachon ko'lamni tekshirgan bo'ladi).
const loadGroup = (id) =>
  prisma.group.findUnique({ where: { id: String(id) }, include: GROUP_INCLUDE });

export const update = async (id, body) => {
  // Arxivlangan guruhni ham yuklaymiz - endDate'ni tahrirlab REACTIVATE qilish
  // (kelajakka uzaytirish) shu yo'l orqali bo'ladi.
  // FILIAL: boshqa filial guruhini tahrirlab bo'lmaydi.
  const group = await prisma.group.findFirst({
    where: { id: String(id), ...branchFilter() },
    include: GROUP_INCLUDE,
  });
  if (!group || group.isDeleted) throw new ApiError(404, "Guruh topilmadi");

  if (body.teachers !== undefined) await ensureTeachers(body.teachers);

  // Jadval to'qnashuvi tekshiruvi - o'zgartirishdan OLDIN (toza rad etish uchun).
  // Jadval o'zgarsa: joriy o'qituvchilar; o'qituvchi qo'shilsa: yangi qo'shilganlar -
  // hammasi incoming (yangi yoki mavjud) jadval bilan solishtiriladi.
  {
    const scheduleForCheck =
      body.schedule !== undefined ? body.schedule : group.schedule;
    // KO'P-KO'PGA: `.map(String)` obyektlar ustida "[object Object]" berardi.
    const currentTeacherIds = teacherIdsOf(group);
    const toCheck = new Set();
    if (body.schedule !== undefined) {
      currentTeacherIds.forEach((t) => toCheck.add(t));
    }
    if (body.teachers !== undefined && group.isActive) {
      (body.teachers || [])
        .map(String)
        .filter((t) => !currentTeacherIds.includes(t))
        .forEach((t) => toCheck.add(t));
    }
    for (const teacherId of toCheck) {
      // eslint-disable-next-line no-await-in-loop
      await teacherGroupPeriodService.assertTeacherScheduleFree(
        teacherId,
        scheduleForCheck,
        group.id,
      );
    }
  }

  const data = {};
  if (body.name !== undefined) data.name = body.name.trim();

  // KURS va XONA. Tekshiruvlar create() dagi bilan AYNI - ular bitta
  // joyda turgani uchun ikki yo'l vaqt o'tib ajralib ketmaydi.
  //
  // XONA uchun filial GURUHNIKI olinadi (body'dan emas): guruhning
  // filiali bu yerda o'zgarmaydi, ya'ni xona baribir shu filialda
  // bo'lishi shart.
  if (body.courseId !== undefined) {
    await assertCourseExists(body.courseId);
    data.courseId = body.courseId || null;
  }
  if (body.roomId !== undefined) {
    await assertRoomInBranch(body.roomId, group.branchId);
    data.roomId = body.roomId || null;
  }

  // Versiyalash: client HOZIRGI versiya qatorlarini + bitta "amal qilish sanasi"
  // (scheduleEffectiveFrom) yuboradi. Yangi jadval joriy amaldagi versiyadan farq
  // qilsa - eski versiyalar TARIX uchun saqlanib, yangi qatorlar shu sanadan
  // boshlab amal qiladi. Farq bo'lmasa - hech narsa o'zgartirmaymiz.
  if (body.schedule !== undefined) {
    const merged = mergeScheduleVersion(
      group.schedule,
      body.schedule,
      body.scheduleEffectiveFrom,
    );
    // `null` = o'zgarish yo'q. Jadvalga TEGMAYMIZ: `deleteMany + create`
    // bejiz ishga tushsa qatorlar qayta yaratilib, keraksiz yozuv bo'lardi.
    if (merged) {
      data.schedule = { deleteMany: {}, create: merged };
    }
  }

  if (body.startDate !== undefined) {
    data.startDate = body.startDate ? toUtcMidnight(body.startDate) : null;
  }
  if (body.durationMonths !== undefined) {
    data.durationMonths = body.durationMonths ?? null;
  }
  // Kirish siyosati o'zgardimi - joriy oy qarzlarini qayta hisoblash kerak
  // (quyida, saqlashdan KEYIN). Aks holda o'zgarish keyingi biror
  // recalc'gacha kuchga kirmay turardi.
  const entryBillingChanged =
    body.entryBilling !== undefined && body.entryBilling !== group.entryBilling;
  if (body.entryBilling !== undefined) {
    data.entryBilling = body.entryBilling;
  }
  if (body.endDate !== undefined) {
    const newEnd = body.endDate ? toUtcMidnight(body.endDate) : null;
    // Yangi startDate shu chaqiruvda kelgan bo'lsa - AYNAN o'shani
    // solishtiramiz (Mongoose hujjatni joyida mutatsiya qilardi).
    const nextStart = data.startDate !== undefined ? data.startDate : group.startDate;
    if (newEnd && nextStart && newEnd.getTime() < toUtcMidnight(nextStart).getTime()) {
      throw new ApiError(400, "Kurs tugash sanasi boshlanish sanasidan oldin bo'lmasin");
    }
    data.endDate = newEnd;
  }

  await prisma.group.update({ where: { id: group.id }, data });

  // KIRISH SIYOSATI O'ZGARDI - joriy oy qarzlari darhol qayta hisoblanadi.
  //
  // ATAYLAB FAQAT JORIY OY: o'tgan oylar odatda to'langan va yopilgan,
  // ularni qayta yozish tarixdagi hisob-kitobni buzardi.
  if (entryBillingChanged) {
    const today = localTodayMidnight();
    try {
      await financePaymentService.recalcForGroupMonth(
        group.id,
        today.getUTCFullYear(),
        today.getUTCMonth() + 1,
      );
    } catch (err) {
      logger.warn({ err }, "Kirish siyosati o'zgarishida qarz qayta hisoblanmadi");
    }
  }

  // endDate berilgan bo'lsa hayot-tsiklni moslaymiz (arxiv / reactivate +
  // o'qituvchi davri va o'quvchi a'zoliklari avto yopiladi / ochiladi).
  if (body.endDate !== undefined) {
    await reconcileGroupEnd(await loadGroup(group.id));
  }

  // O'qituvchi o'zgarishi - faqat AKTIV guruhda (davrlardan derived maosh).
  // reconcile'dan KEYIN, teachers keshi yangilangach hisoblanadi.
  if (body.teachers !== undefined) {
    const fresh = await loadGroup(group.id);
    if (fresh.isActive) {
      const oldIds = teacherIdsOf(fresh);
      const newIds = (body.teachers || []).map(String);
      const removed = oldIds.filter((t) => !newIds.includes(t));
      const added = newIds.filter((t) => !oldIds.includes(t));
      const today = localTodayMidnight();
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth() + 1;
      for (const teacherId of removed) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await teacherGroupPeriodService.unassignTeacher(group.id, teacherId, { endDate: today });
        } catch (err) {
          logger.warn({ err }, "Chiqarilgan o'qituvchi davri yopilmadi");
        }
      }
      for (const teacherId of added) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await teacherGroupPeriodService.assignTeacher(group.id, teacherId, { startDate: today });
          // eslint-disable-next-line no-await-in-loop
          await teacherSalaryService.ensureSalaryForTeacherGroup(teacherId, group.id, year, month);
        } catch (err) {
          logger.warn({ err }, "Qo'shilgan o'qituvchi biriktirilmadi / maosh yaratilmadi");
        }
      }
    }
  }

  return shapeGroup(await loadGroup(group.id));
};

// Guruh tugaganda/arxivlanganda aktiv o'qituvchilarning dars berish davrini yopadi
// (tugash sanasida). endDate EXCLUSIVE → `end` inclusive oxirgi ish kuni bo'lib
// qoladi. Maosh shu oyda davrdan derived proratsiya bilan hisoblanadi. Yopilgan
// davrlarning id'larini qaytaradi (arxivdan chiqarishda aynan shular qayta ochiladi).
const prorateTeachersOnEnd = async (group, end) => {
  const endExclusive = new Date(toUtcMidnight(end).getTime() + 24 * 60 * 60 * 1000);
  const activeIds = await teacherGroupPeriodService.activeTeacherIdsForGroup(group.id, end);
  const closedIds = [];
  for (const teacherId of activeIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const closed = await teacherGroupPeriodService.unassignTeacher(
        group.id,
        teacherId,
        { endDate: endExclusive },
      );
      // `archivedClosedPeriods` - SKALYAR String[]. `closed._id` Prisma
      // yozuvida `undefined` bo'lardi va massiv `undefined` bilan to'lib,
      // arxivdan chiqarishda HECH BIR davr qayta ochilmasdi.
      if (closed?.id) closedIds.push(String(closed.id));
    } catch (err) {
      logger.warn({ err }, "Guruh tugashida o'qituvchi davri yopilmadi");
    }
  }
  return closedIds;
};

// Kurs tugaganda ochiq o'quvchi a'zoliklarini tugash sanasida yopadi (leftAt
// EXCLUSIVE → endExclusive=end+1kun, oxirgi aktiv kun = end). Reactivate uchun
// yopilgan a'zolik id'larini qaytaradi.
const closeMembershipsOnEnd = async (group, end) => {
  const endExclusive = new Date(toUtcMidnight(end).getTime() + 24 * 60 * 60 * 1000);
  const open = await prisma.groupMembership.findMany({
    where: { groupId: group.id, leftAt: null, isDeleted: false },
    select: { id: true, studentId: true },
  });
  const closedIds = [];
  for (const m of open) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await prisma.groupMembership.update({
        where: { id: m.id },
        data: { leftAt: endExclusive, leftReason: "graduated" },
      });
      // eslint-disable-next-line no-await-in-loop
      await recalcFinanceOnLeave(group.id, m.studentId);
      // eslint-disable-next-line no-await-in-loop
      await safeRecomputeStudentCompletion(m.studentId);
      closedIds.push(String(m.id));
    } catch (err) {
      logger.warn({ err }, "Kurs tugashida o'quvchi a'zoligi yopilmadi");
    }
  }
  return closedIds;
};

// Kurs qayta aktivlashganda yopilgan a'zolikni qayta ochadi (leftAt=null), agar
// shu o'quvchi+guruhda boshqa ochiq a'zolik bo'lmasa (single-open invariant).
const reopenMembership = async (membershipId) => {
  const m = await prisma.groupMembership.findUnique({ where: { id: String(membershipId) } });
  if (!m || m.isDeleted || m.leftAt === null) return;
  const openExists = await prisma.groupMembership.findFirst({
    where: { groupId: m.groupId, studentId: m.studentId, leftAt: null, isDeleted: false },
    select: { id: true },
  });
  if (openExists) return;
  const reopened = await prisma.groupMembership.update({
    where: { id: m.id },
    data: {
      leftAt: null,
      leftReason: null,
      // `transferredTo` - RELATION; ustun nomi `transferredToId`.
      // Relation nomini `data` ga yozish `connect/disconnect` degani bo'lardi.
      transferredToId: null,
    },
  });
  await ensureFinanceForMembershipRange(m.groupId, reopened);
  await safeRecomputeStudentCompletion(m.studentId);
};

// Guruh hayot-tsiklini endDate'ga moslaydi (idempotent). Yagona manba: endDate.
// Avval kurs-tugashi yopgan davr/a'zoliklarni qayta ochadi (endDate o'zgarishi
// uchun toza qayta yopish), so'ng endDate o'tgan bo'lsa o'sha kunda yopadi.
// create/update (endDate o'zgarsa) va kunlik job chaqiradi.
export const reconcileGroupEnd = async (group) => {
  const today = localTodayMidnight();
  const end = group.endDate ? toUtcMidnight(group.endDate) : null;
  const ended = !!end && end.getTime() <= today.getTime();

  const data = {};

  const hadClosed =
    (group.archivedClosedPeriods?.length || 0) +
      (group.archivedClosedMemberships?.length || 0) >
    0;
  if (hadClosed) {
    for (const pid of group.archivedClosedPeriods || []) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await teacherGroupPeriodService.reopenPeriod(pid);
      } catch (err) {
        logger.warn({ err }, "Reactivate: o'qituvchi davri qayta ochilmadi");
      }
    }
    for (const mid of group.archivedClosedMemberships || []) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await reopenMembership(mid);
      } catch (err) {
        logger.warn({ err }, "Reactivate: o'quvchi a'zoligi qayta ochilmadi");
      }
    }
    data.archivedClosedPeriods = [];
    data.archivedClosedMemberships = [];
  }

  if (ended) {
    data.archivedClosedPeriods = await prorateTeachersOnEnd(group, end);
    data.archivedClosedMemberships = await closeMembershipsOnEnd(group, end);
    data.isActive = false;
  } else {
    data.isActive = true;
  }
  const saved = await prisma.group.update({
    where: { id: group.id },
    data,
    include: GROUP_INCLUDE,
  });
  return saved;
};

// Tugash sanasi YETIB KELGAN, lekin hali aktiv guruhlarni avto arxivlaydi (kunlik
// job + boot catch-up chaqiradi). Idempotent.
export const processDueGroupEnds = async () => {
  const today = localTodayMidnight();
  const due = await prisma.group.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      endDate: { not: null, lte: today },
    },
    include: GROUP_INCLUDE,
  });
  let archived = 0;
  for (const group of due) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await reconcileGroupEnd(group);
      archived += 1;
    } catch (err) {
      logger.warn({ err, group: group.id }, "Guruh avto-arxivlanmadi");
    }
  }
  return { processed: due.length, archived };
};

// Butunlay o'chirish - guruh va unga bog'liq BARCHA yozuvlar
// (a'zolik, davomat, baho, to'lov, maosh, narx, dars davri...) fizik o'chadi.
//
// DIQQAT: MOLIYAVIY TARIXI BOR GURUH O'CHIRILMAYDI. Jurnalda yozuvi bo'lsa
// `409 GROUP_HAS_FINANCIAL_HISTORY` qaytadi va arxivlash tavsiya etiladi
// (batafsil sabab pastdagi tekshiruv ustidagi izohda).
// Tasdiqlash uchun guruh nomini to'g'ri yozish shart (qaytarib bo'lmaydi).
// MOLIYAVIY IZCHILLIK: o'quvchi/o'qituvchi hard-delete kabi, kirim/chiqim yozuvlari
// hisobotlardan toza chiqadi. YAGONA majburiy tuzatuv - depozitdan qoplangan
// (source:"deposit") to'lovlarni o'quvchi depozitiga qaytarish (aks holda garov
// izsiz yo'qolardi). Boshqa guruhlar/o'qituvchilar moliyasi o'zaro bog'liq emas.
export const permanentRemove = async (id, currentUser, { confirmName } = {}) => {
  // FILIAL: bu QAYTARIB BO'LMAYDIGAN amal - guruh va uning butun ma'lumoti
  // (davomat, baho, to'lov tarixi) o'chadi. Boshqa filial guruhiga
  // yetib borishi mumkin bo'lgan eng xavfli yo'l shu edi.
  const group = await prisma.group.findFirst({
    where: { id: String(id), ...branchFilter() },
    select: { id: true, name: true, isActive: true, endDate: true },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  // O'chirish faqat: (a) guruhda AKTIV o'quvchi bo'lmasa (0 ta) YOKI (b) kurs
  // yakunlangan bo'lsa. Aktiv kursda o'quvchilar bo'lsa - avval o'quvchilarni
  // chiqaring yoki kursni yakunlang.
  const ended =
    group.endDate &&
    toUtcMidnight(group.endDate).getTime() <= localTodayMidnight().getTime();
  const finished = !group.isActive || ended;
  if (!finished) {
    const activeStudents = await prisma.groupMembership.count({
      where: { groupId: group.id, leftAt: null, isDeleted: false },
    });
    if (activeStudents > 0) {
      throw new ApiError(
        400,
        "Guruhda o'quvchilar bor. Avval o'quvchilarni chiqaring yoki kursni yakunlang, so'ngra o'chiring",
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MOLIYAVIY TARIX — O'CHIRISHNI TO'SADI (ARXIVLASH BOR).
  //
  // Jurnalda izi bor guruh HECH QACHON o'chirilmaydi. Sabab quyidagi
  // yozuvda: `journal_entries.groupId` `RESTRICT`
  // (`20260820120000_restrict_journal_and_salary_ownership_fks`), chunki
  // ilgari u `SET NULL` edi va guruhni o'chirish jurnal yozuvining
  // EGASINI jimgina o'chirib yuborardi. Summalar joyida qolgani uchun
  // na muvozanat tekshiruvi, na `reconcile()` buni topardi — faqat
  // "bu pul QAYSI guruhga tegishli edi" degan javob yo'qolardi.
  //
  // NEGA BU YERDA, FK'ning O'ZIGA TASHLAB QO'YILMAYDI: FK xatosi
  // tranzaksiyaning O'RTASIDA, depozitlar allaqachon qaytarilgandan
  // KEYIN chiqadi va foydalanuvchiga tushunarsiz
  // "Foreign key constraint violated" bo'lib ko'rinadi. Tranzaksiya
  // qaytariladi, ya'ni ma'lumot buzilmaydi — lekin xabar hech narsa
  // tushuntirmaydi. Bu tekshiruv esa OLDINDAN, hech narsaga tegmasdan
  // aniq sabab va aniq yechim beradi.
  //
  // NEGA JURNALNI O'CHIRIB YUBORMAYMIZ: jurnal — o'zgarmas moliyaviy
  // daftar. `hardDeleteGroupData()` guruhning OPERATSION yozuvlarini
  // (to'lov rejasi, maosh, tarif) tozalaydi, lekin jurnalga ATAYLAB
  // tegmaydi. Kaskad qilish daftarni buzardi.
  //
  // YECHIM — ARXIVLASH. Bu kodbazada guruhni arxivlash = KURSNI YAKUNLASH
  // (`update({ endDate })` → `reconcileGroupEnd`, `autoEndGroups` jobi ham
  // shuni qiladi). Guruh faol ro'yxatdan chiqadi, moliyaviy tarixi esa
  // JOYIDA qoladi. Guruh uchun boshqa "soft-delete" yo'li yo'q —
  // `isDeleted` faqat kaskad orqali (o'quvchi/filial o'chganda) qo'yiladi.
  // ═══════════════════════════════════════════════════════════════════════
  const journalEntries = await prisma.journalEntry.count({
    where: { groupId: group.id },
  });
  if (journalEntries > 0) {
    throw new ApiError(
      409,
      `Bu guruhda moliyaviy tarix bor (${journalEntries} ta jurnal yozuvi) - ` +
        `uni butunlay o'chirib bo'lmaydi, chunki moliyaviy daftar o'zgarmas. ` +
        `Guruhni ARXIVLANG (kursni yakunlang): u faol ro'yxatdan chiqadi, ` +
        `tarixi esa to'liq saqlanadi`,
      { code: "GROUP_HAS_FINANCIAL_HISTORY", details: { journalEntries } },
    );
  }

  const name = (group.name || "").trim();
  if (!confirmName || confirmName.trim() !== name) {
    throw new ApiError(400, "Tasdiqlash uchun guruh nomini to'g'ri kiriting");
  }

  // Depozit qaytarish + fizik o'chirish BITTA tranzaksiyada. Mongo'da
  // atomiklik SHARTLI edi (replica set bo'lmasa yo'q) - ya'ni depozit
  // qaytarilib, guruh o'chmay qolishi MUMKIN edi va o'quvchi pulni ikki
  // marta olardi. Postgres'da bunday holat yo'q.
  const studentIds = await runFinanceTxn(async (tx) => {
    // 1) MAJBURIY: depozitdan qoplangan to'lovlarni o'quvchi depozitiga QAYTARAMIZ.
    const covers = await tx.paymentTransaction.findMany({
      where: { groupId: group.id, source: "deposit", isDeleted: false },
      select: { studentId: true, amount: true },
    });
    const perStudent = new Map();
    for (const c of covers) {
      if (!c.studentId) continue;
      const key = String(c.studentId);
      perStudent.set(key, (perStudent.get(key) || 0) + (c.amount || 0));
    }
    for (const [sid, total] of perStudent) {
      if (total > 0) {
        // eslint-disable-next-line no-await-in-loop
        await depositService.refundToDeposit(sid, total, {
          tx,
          note: "Guruh o'chirildi - to'lovga qaytarildi",
        });
      }
    }

    // 2) Guruhga oid BARCHA yozuvlarni fizik o'chiramiz + guruhning o'zini.
    const sids = await hardDeleteGroupData(group.id, { tx });
    // Jadval qatorlari `onDelete: Cascade` bilan o'zi ketadi, lekin
    // ko'p-ko'pga bog'lanish (teachers) join jadvalini OCHIQ bo'shatamiz -
    // aks holda o'chirish FK cheklovi bilan yiqilardi.
    await tx.group.update({ where: { id: group.id }, data: { teachers: { set: [] } } });
    await tx.groupScheduleItem.deleteMany({ where: { groupId: group.id } });
    await tx.group.delete({ where: { id: group.id } });
    return sids;
  });

  // A'zolik o'chgani uchun o'quvchilar yakunlash sanasini qayta hisoblaymiz (best-effort).
  for (const sid of studentIds) {
    // eslint-disable-next-line no-await-in-loop
    await safeRecomputeStudentCompletion(sid);
  }

  // Owner uchun tizim bildirishnomasi (best-effort).
  try {
    await systemNotificationsService.create({
      message: `${name} guruhi tizimdan butunlay o'chirildi`,
    });
  } catch {
    // bildirishnoma yozilmasa ham o'chirish buzilmasin
  }

  return { id: group.id, _id: group.id };
};

// O'chirilgan guruhni qaytarish
export const restoreDeleted = async (id) => {
  const group = await prisma.group.findUnique({ where: { id: String(id) } });
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  await cascadeRestoreGroup(group.id);
  return shapeGroup(await loadGroup(group.id));
};

// Membershipning joinedAt oyidan tugash oyigacha (leftAt yoki bugun) har bir oy
// uchun GroupFee (backfill) + proratsiyalangan to'lov + o'qituvchi maoshini
// yaratadi/yangilaydi (best-effort). Eski o'quvchi joinedAt o'tgan oyga qo'yilsa,
// o'tgan oylar qarzi ham proratsiyalangan holda chiqadi.
const ensureFinanceForMembershipRange = async (groupId, membership) => {
  try {
    const today = localTodayMidnight();
    // Tugash chegarasi: leftAt bo'lsa o'sha oy, aks holda joriy oy.
    const endRef = membership.leftAt
      ? toUtcMidnight(membership.leftAt)
      : today;
    const endYear = endRef.getUTCFullYear();
    const endMonth = endRef.getUTCMonth() + 1; // 1-12

    const join = new Date(membership.joinedAt);
    let year = join.getUTCFullYear();
    let month = join.getUTCMonth() + 1; // 1-12

    while (year < endYear || (year === endYear && month <= endMonth)) {
      // eslint-disable-next-line no-await-in-loop
      await financeGroupFeeService.ensureGroupFeeBackfill(groupId, year, month);
      // eslint-disable-next-line no-await-in-loop
      await financePaymentService.ensurePaymentForMembership(membership, year, month);
      // eslint-disable-next-line no-await-in-loop
      await teacherSalaryService.recalcForGroupMonth(groupId, year, month);

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  } catch (err) {
    logger.warn({ err }, "A'zolik uchun oylik to'lovlar yaratilmadi");
  }
};

/**
 * ORQAGA SANA QO'YISH TA'SIRINI OLDINDAN HISOBLAYDI (hech narsa saqlamaydi).
 *
 * NEGA KERAK: joinedAt o'tgan oyga qo'yilsa ensureFinanceForMembershipRange
 * har bir oy uchun QARZ yaratadi - o'quvchi hech qanday ogohlantirishsiz
 * to'satdan 3 oylik qarzdor bo'lib qoladi.
 */
export const previewBackdate = async (groupId, { joinedAt, leftAt } = {}) => {
  const group = await ensureGroup(groupId);
  const today = localTodayMidnight();

  const groupStart = toUtcMidnight(group.startDate || group.createdAt);
  const join = joinedAt ? toUtcMidnight(joinedAt) : groupStart;
  const left = leftAt ? toUtcMidnight(leftAt) : null;
  const endRef = left || today;

  const months = [];
  let year = join.getUTCFullYear();
  let month = join.getUTCMonth() + 1;
  const endYear = endRef.getUTCFullYear();
  const endMonth = endRef.getUTCMonth() + 1;

  // Joriy oy - "orqaga" hisoblanmaydi (odatiy qo'shish).
  const currentKey = today.getUTCFullYear() * 100 + today.getUTCMonth() + 1;

  let estimatedDebt = 0;
  // Cheksiz siklga qarshi qo'riqchi: 10 yildan uzun oraliq real emas va
  // noto'g'ri sana kiritilganda serverni osib qo'yardi.
  let guard = 0;
  while ((year < endYear || (year === endYear && month <= endMonth)) && guard < 120) {
    guard += 1;
    // Fee hali yaratilmagan bo'lsa o'sha vaqtda amalda bo'lgan eng yaqin
    // tarif bilan taxmin qilamiz - aynan ensureGroupFeeBackfill ishlatadigan
    // qiymat, ya'ni preview haqiqiy natijaga mos keladi.
    // eslint-disable-next-line no-await-in-loop
    const amount =
      Number(await financeGroupFeeService.nearestFeeAmount(group.id, year, month)) || 0;
    const isPast = year * 100 + month < currentKey;
    months.push({ year, month, amount, isPast });
    if (isPast) estimatedDebt += amount;

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return {
    months,
    monthCount: months.length,
    pastMonthCount: months.filter((m) => m.isPast).length,
    // Faqat O'TGAN oylar "yangi qarz" - joriy oy baribir yaratilardi.
    estimatedDebt,
    isBackdated: months.some((m) => m.isPast),
    groupStartDate: group.startDate || null,
  };
};

/**
 * Orqaga sana bilan qo'shishni TASDIQQA yuboradi (a'zolik yaratmaydi).
 *
 * NEGA TASDIQ: o'tgan oyga qarz yozish - chegirma berishning TESKARISI.
 * Chegirma allaqachon tasdiqdan o'tadi (DISCOUNT_SET), demak teskari
 * yo'nalish ham o'tishi kerak, aks holda "eshik yopilib, yonidagi deraza
 * ochiq" qolardi: qarzni sun'iy yaratib, keyin uni write-off qilish orqali
 * pul o'g'irlash yo'li ochilardi.
 */
export const requestBackdate = async (groupId, studentId, body, currentUser) => {
  const approvalService = await import(
    "../../expenseApprovals/services/expenseApproval.service.js"
  );
  const { APPROVAL_KINDS } = await import("../../../constants/approvals.js");

  const group = await ensureGroup(groupId);
  const student = await ensureStudent(studentId);
  const preview = await previewBackdate(groupId, body);
  const branchId = await resolveBranchFromGroup(groupId);

  return approvalService.createRequest({
    branchId,
    kind: APPROVAL_KINDS.MEMBERSHIP_BACKDATE,
    // Limit bilan solishtiriladigan qiymat - YARATILADIGAN QARZ.
    amount: Math.max(1, preview.estimatedDebt),
    payload: {
      group: String(group.id),
      student: String(student.id),
      joinedAt: body.joinedAt,
      leftAt: body.leftAt ?? null,
      previewDebt: preview.estimatedDebt,
      previewMonths: preview.pastMonthCount,
    },
    // Bir o'quvchi + bir guruh uchun bitta kutilayotgan so'rov.
    subjectKey: `membership_backdate:${String(group.id)}:${String(student.id)}`,
    subjectName: `${student.firstName} ${student.lastName || ""}`.trim(),
    contextName: `${group.name} - ${preview.pastMonthCount} oy, ${preview.estimatedDebt} so'm qarz`,
    requestNote: body.requestNote,
    currentUser,
  });
};

/**
 * Tasdiqlangan orqaga-sana so'rovini bajaradi.
 *
 * addStudent'ning O'ZINI chaqiradi - ya'ni barcha qo'riqchilar (guruh
 * boshlangan sana, ro'yxatga olingan sana, davrlar kesishuvi) SHU YERDA
 * QAYTA ishlaydi.
 */
export const executeApprovedBackdate = async (approval) => {
  const p = approval?.payload || {};
  if (!p.group || !p.student) {
    throw new ApiError(400, "So'rovda guruh yoki o'quvchi ko'rsatilmagan");
  }
  return addStudent(p.group, p.student, {
    joinedAt: p.joinedAt,
    leftAt: p.leftAt ?? null,
  });
};

const DAY_LABELS_FULL_UZ = {
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
};

// Ikki vaqt oralig'i kesishadimi ("HH:mm" nol to'ldirilgani uchun string solishtiruv).
// Yopiq-ochiq: 14:00-15:00 va 15:00-16:00 kesishmaydi.
const timesOverlap = (aStart, aEnd, bStart, bEnd) =>
  aStart < bEnd && bStart < aEnd;

// A jadvalidagi biror slot B dagi slot bilan bir kun + kesishuvchi vaqtga tushsa,
// o'sha (a,b) juftlarini qaytaradi.
const findSlotConflicts = (slotsA, slotsB) => {
  const out = [];
  for (const a of slotsA) {
    for (const b of slotsB) {
      if (
        a.day === b.day &&
        timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)
      ) {
        out.push(b);
      }
    }
  }
  return out;
};

// Berilgan o'quvchilardan qaysilari MAQSAD guruh jadvali bilan bir kun/bir vaqtda
// to'qnashuvchi (boshqa aktiv guruhdagi) darsga ega ekanini aniqlaydi.
export const checkStudentsScheduleConflicts = async (groupId, studentIds) => {
  const ids = [...new Set((studentIds || []).map(String))];
  if (!ids.length) return [];

  const group = await prisma.group.findUnique({
    where: { id: String(groupId) },
    select: { id: true, schedule: SCHEDULE_SELECT },
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  const targetSlots = scheduleActiveOn(group.schedule || []);
  // Maqsad guruhning jadvali bo'sh - to'qnashuv bo'lishi mumkin emas.
  if (!targetSlots.length) return [];

  // O'quvchilarning MAQSAD guruhdan boshqa aktiv (tugamagan) a'zoliklari.
  const mems = await prisma.groupMembership.findMany({
    where: {
      studentId: { in: ids },
      groupId: { not: group.id },
      leftAt: null,
      isDeleted: false,
    },
    select: { studentId: true, groupId: true },
  });
  if (!mems.length) return [];

  // Tegishli guruhlar jadvallari (faqat aktiv guruhlar).
  const otherGroupIds = [...new Set(mems.map((m) => String(m.groupId)))];
  const otherGroups = await prisma.group.findMany({
    where: { id: { in: otherGroupIds }, isActive: true, isDeleted: false },
    select: { id: true, name: true, schedule: SCHEDULE_SELECT },
  });
  const groupById = new Map(otherGroups.map((g) => [String(g.id), g]));

  // O'quvchilar ismlarini birga chiqarish uchun.
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, username: true },
  });
  const nameById = new Map(
    users.map((u) => [
      String(u.id),
      `${u.firstName} ${u.lastName || ""}`.trim() || `@${u.username}`,
    ]),
  );

  const byStudent = new Map();
  for (const m of mems) {
    const g = groupById.get(String(m.groupId));
    if (!g) continue;
    const hits = findSlotConflicts(targetSlots, scheduleActiveOn(g.schedule || []));
    if (!hits.length) continue;
    const key = String(m.studentId);
    const arr = byStudent.get(key) || [];
    for (const h of hits) {
      arr.push({
        groupName: g.name,
        day: h.day,
        dayLabel: DAY_LABELS_FULL_UZ[h.day] || h.day,
        startTime: h.startTime,
        endTime: h.endTime,
      });
    }
    byStudent.set(key, arr);
  }

  return ids
    .filter((id) => byStudent.has(id))
    .map((id) => ({
      studentId: id,
      studentName: nameById.get(id) || "",
      conflicts: byStudent.get(id),
    }));
};

// Bir nechta o'quvchini bitta guruhga qo'shadi. force=false bo'lsa avval dars
// to'qnashuvini tekshiradi - to'qnashuv bo'lsa HECH KIM qo'shilmaydi va
// { requiresConfirmation:true, conflicts } qaytadi. Har bir o'quvchi alohida
// qo'shiladi; bittasi xato bersa qolganlari qo'shilaveradi.
export const addStudentsBulk = async (
  groupId,
  studentIds,
  { joinedAt, leftAt, force = false } = {},
) => {
  await ensureGroup(groupId);
  const ids = [...new Set((studentIds || []).map(String))];
  if (!ids.length) throw new ApiError(400, "O'quvchi tanlanmagan");

  if (!force) {
    const conflicts = await checkStudentsScheduleConflicts(groupId, ids);
    if (conflicts.length) {
      return { requiresConfirmation: true, conflicts, added: [], failed: [] };
    }
  }

  const added = [];
  const failed = [];
  for (const studentId of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const membership = await addStudent(groupId, studentId, { joinedAt, leftAt });
      added.push({ studentId, membershipId: membership.id });
    } catch (err) {
      failed.push({
        studentId,
        message: err?.message || "Qo'shib bo'lmadi",
      });
    }
  }
  return { requiresConfirmation: false, conflicts: [], added, failed };
};

export const addStudent = async (
  groupId,
  studentId,
  { joinedAt, leftAt } = {},
) => {
  const group = await ensureGroup(groupId);
  const student = await ensureStudent(studentId);

  const existing = await prisma.groupMembership.findFirst({
    where: { groupId: group.id, studentId: student.id, leftAt: null, isDeleted: false },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError(409, "O'quvchi allaqachon shu guruhda");
  }

  // Boshlash sanasi - berilsa o'sha kun, aks holda guruh BOSHLANGAN sana (default):
  // startDate (Dars boshlanish sanasi), u yo'q bo'lsa guruh yaratilgan sanasi.
  // MUHIM: guruh o'quvchi ro'yxatga olinishidan OLDIN boshlangan bo'lsa, default
  // sana ro'yxatga olingan kun bo'ladi - aks holda "10-iyulda ro'yxatga olingan,
  // lekin 1-iyuldan o'qiyapti" degan bo'lmagan davr paydo bo'lardi.
  const groupStart = toUtcMidnight(group.startDate || group.createdAt);
  const enrolledStart = student.enrolledAt
    ? toUtcMidnight(student.enrolledAt)
    : null;
  const defaultJoin =
    enrolledStart && enrolledStart.getTime() > groupStart.getTime()
      ? enrolledStart
      : groupStart;
  const join = joinedAt ? toUtcMidnight(joinedAt) : defaultJoin;
  const left = leftAt ? toUtcMidnight(leftAt) : null;
  if (left && left.getTime() < join.getTime()) {
    throw new ApiError(400, "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas");
  }
  // O'quvchini guruh boshlangan sanadan OLDIN qo'shib bo'lmaydi.
  if (join.getTime() < groupStart.getTime()) {
    throw new ApiError(
      400,
      "O'quvchini guruh boshlangan sanadan oldin qo'shib bo'lmaydi",
    );
  }
  // O'quvchini o'zi ro'yxatga olingan sanadan OLDIN guruhga qo'shib bo'lmaydi.
  if (enrolledStart && join.getTime() < enrolledStart.getTime()) {
    throw new ApiError(
      400,
      "O'quvchini ro'yxatga olingan sanadan oldin guruhga qo'shib bo'lmaydi",
    );
  }

  // A'zolik davrlari kesishmasligi + bitta ochiq (tugamagan) bo'lishi shart.
  const otherMems = await prisma.groupMembership.findMany({
    where: { groupId: group.id, studentId: student.id, isDeleted: false },
    select: { joinedAt: true, leftAt: true },
  });
  assertPeriodInvariants(
    { startDate: join, endDate: left },
    otherMems.map((m) => ({ startDate: m.joinedAt, endDate: m.leftAt })),
    "date",
  );

  const membership = await prisma.groupMembership.create({
    data: {
      groupId: group.id,
      studentId: student.id,
      joinedAt: join,
      leftAt: left,
    },
  });

  // joinedAt oyidan tugash oyigacha barcha oylar uchun qarz yoziladi.
  await ensureFinanceForMembershipRange(group.id, membership);

  // BOSHLANG'ICH QARZNI YOZIB QO'YISH.
  //
  // O'quvchi guruhsiz yaratilgan bo'lsa, uning tizimga kirishidan
  // oldingi qarzi "guruh kutmoqda" holatida turadi (StudentPayment
  // qatori guruhsiz mavjud bo'lolmaydi). Guruh ANIQ bo'lgan birinchi
  // daqiqa - aynan shu yer.
  //
  // ensureFinanceForMembershipRange'dan KEYIN: ichkarida depozitdan
  // avto-qoplash chaqiriladi va u eng eski qarzdan boshlab yopadi.
  //
  // IDEMPOTENT va BEST-EFFORT: ikkinchi guruhda qayta ishlamaydi
  // (yozuv endi "kutmayapti"), xatosi esa guruhga qo'shishni bekor qilmaydi.
  await openingBalanceService.materializePendingForStudent(student.id, group.id);

  await safeRecomputeStudentCompletion(student.id);

  return withLegacyId(membership);
};

// O'quvchining guruhdagi FAOL a'zoligi sanalarini (joinedAt/leftAt) tahrirlaydi.
// Qulf: joinedAt'ni OLDINGA (kechroq sanaga) surishda, oradagi davrda biror oy
// to'langan bo'lsa (paidAmount > 0) - rad etiladi.
const applyMembershipDates = async (membership, { joinedAt, leftAt } = {}) => {
  const groupId = membership.groupId;
  const studentId = membership.studentId;

  const oldJoin = toUtcMidnight(membership.joinedAt);
  const newJoin =
    joinedAt !== undefined && joinedAt !== null
      ? toUtcMidnight(joinedAt)
      : oldJoin;
  // leftAt: undefined → o'zgartirmaymiz; null → "o'qimoqda"ga qaytaramiz.
  const newLeft =
    leftAt === undefined
      ? membership.leftAt
        ? toUtcMidnight(membership.leftAt)
        : null
      : leftAt
        ? toUtcMidnight(leftAt)
        : null;

  if (newLeft && newLeft.getTime() < newJoin.getTime()) {
    throw new ApiError(400, "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas");
  }

  // A'zolik boshlanish sanasi guruh boshlangan sanadan oldin bo'lmasin.
  const groupDoc = await prisma.group.findUnique({
    where: { id: groupId },
    select: { startDate: true, createdAt: true },
  });
  if (groupDoc) {
    const groupStart = toUtcMidnight(groupDoc.startDate || groupDoc.createdAt);
    if (newJoin.getTime() < groupStart.getTime()) {
      throw new ApiError(
        400,
        "A'zolik boshlanish sanasi guruh boshlangan sanadan oldin bo'lmasin",
      );
    }
  }

  // A'zolik o'quvchi ro'yxatga olingan sanadan oldin boshlana olmaydi.
  const studentDoc = await prisma.user.findUnique({
    where: { id: studentId },
    select: { enrolledAt: true },
  });
  if (studentDoc?.enrolledAt) {
    const enrolledStart = toUtcMidnight(studentDoc.enrolledAt);
    if (newJoin.getTime() < enrolledStart.getTime()) {
      throw new ApiError(
        400,
        "A'zolik boshlanish sanasi ro'yxatga olingan sanadan oldin bo'lmasin",
      );
    }
  }

  // Qulf: joinedAt oldinga surilyaptimi (yangi sana eskidan kech)?
  if (newJoin.getTime() > oldJoin.getTime()) {
    // Yangi joinedAt oyidan OLDIN to'langan oy bormi?
    const paid = await financePaymentService.earliestPaidMonthBefore(
      studentId,
      groupId,
      { year: newJoin.getUTCFullYear(), month: newJoin.getUTCMonth() + 1 },
    );
    if (paid) {
      throw new ApiError(
        409,
        `To'langan davrni o'zgartirib bo'lmaydi: ${paid.year}-yil ${paid.month}-oy uchun to'lov qilingan`,
      );
    }
  }

  // Yangi sanalar boshqa a'zolik davrlari bilan kesishmasligini tekshiramiz.
  const otherMems = await prisma.groupMembership.findMany({
    where: {
      groupId,
      studentId,
      id: { not: membership.id },
      isDeleted: false,
    },
    select: { joinedAt: true, leftAt: true },
  });
  assertPeriodInvariants(
    { startDate: newJoin, endDate: newLeft },
    otherMems.map((m) => ({ startDate: m.joinedAt, endDate: m.leftAt })),
    "date",
  );

  const saved = await prisma.groupMembership.update({
    where: { id: membership.id },
    data: { joinedAt: newJoin, leftAt: newLeft },
  });

  // Eski davrda bo'lib, yangi davrga TUSHMAY qolgan oylarni 0 ga tushirish va
  // yangi davr oylarini yaratish uchun shu o'quvchi-guruhning BARCHA to'lovlarini
  // qayta hisoblaymiz, so'ng yangi davr oylari uchun yozuvlar ta'minlanadi.
  try {
    await financePaymentService.recalcForStudentScope(studentId, groupId, {});
  } catch (err) {
    logger.warn({ err }, "A'zolik tahrirlanganda eski to'lovlar qayta hisoblanmadi");
  }
  await ensureFinanceForMembershipRange(groupId, saved);

  await safeRecomputeStudentCompletion(studentId);

  return withLegacyId(saved);
};

export const updateMembership = async (
  groupId,
  studentId,
  { joinedAt, leftAt } = {},
) => {
  const group = await ensureGroup(groupId);
  const student = await ensureStudent(studentId);

  const membership = await prisma.groupMembership.findFirst({
    where: { groupId: group.id, studentId: student.id, leftAt: null, isDeleted: false },
  });
  if (!membership) {
    throw new ApiError(404, "O'quvchining ushbu guruhda faol a'zoligi topilmadi");
  }
  return applyMembershipDates(membership, { joinedAt, leftAt });
};

// O'quvchining guruhdagi BARCHA o'qish davrlari (yopiq + ochiq), eng yangisi yuqorida.
export const listMemberships = async (groupId, studentId) => {
  // FILIAL: guruh ko'lamda bo'lmasa bo'sh natija.
  const scope = await branchGroupFilter("groupId");
  const rows = await prisma.groupMembership.findMany({
    where: {
      groupId: String(groupId),
      studentId: String(studentId),
      isDeleted: false,
      ...scope,
    },
    orderBy: { joinedAt: "desc" },
  });
  return withLegacyIds(rows);
};

// O'qish davrini ID bo'yicha tahrirlash (tarixiy davr ham) - "O'qish davrlari" UI.
export const updateMembershipById = async (
  groupId,
  membershipId,
  { joinedAt, leftAt } = {},
) => {
  const group = await ensureGroup(groupId);
  const membership = await prisma.groupMembership.findFirst({
    where: { id: String(membershipId), groupId: group.id, isDeleted: false },
  });
  if (!membership) throw new ApiError(404, "O'qish davri topilmadi");
  return applyMembershipDates(membership, { joinedAt, leftAt });
};

// O'qish davri qamragan oylar (year/month), oxiri joriy oygacha. leftAt EXCLUSIVE.
const membershipMonths = (joinedAt, leftAt) => {
  const DAY = 24 * 60 * 60 * 1000;
  const today = localTodayMidnight();
  const curIdx = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const s = new Date(joinedAt);
  const startIdx = s.getUTCFullYear() * 12 + s.getUTCMonth();
  let endIdx = curIdx;
  if (leftAt) {
    const e = new Date(new Date(leftAt).getTime() - DAY);
    endIdx = e.getUTCFullYear() * 12 + e.getUTCMonth();
  }
  endIdx = Math.min(endIdx, curIdx);
  const out = [];
  for (let i = startIdx; i <= endIdx; i += 1) {
    out.push({ year: Math.floor(i / 12), month: (i % 12) + 1 });
  }
  return out;
};

// O'qish davrini o'chirish - to'lov qo'riqlovchisi bilan (o'qituvchi davri patterni).
export const removeMembershipById = async (groupId, membershipId) => {
  const group = await ensureGroup(groupId);
  const membership = await prisma.groupMembership.findFirst({
    where: { id: String(membershipId), groupId: group.id, isDeleted: false },
  });
  if (!membership) throw new ApiError(404, "O'qish davri topilmadi");

  const months = membershipMonths(membership.joinedAt, membership.leftAt);
  if (months.length) {
    // Mongo `$or: [{year,month},...]` → Prisma `OR: [...]` (shakl bir xil).
    const paid = await prisma.studentPayment.findFirst({
      where: {
        studentId: membership.studentId,
        groupId: group.id,
        paidAmount: { gt: 0 },
        OR: months,
      },
      select: { id: true },
    });
    if (paid) {
      throw new ApiError(
        400,
        "Bu davrga oid to'lov mavjud. Avval to'lovlarni o'chiring.",
      );
    }
  }

  // Qarzli o'quvchining o'qish davrini o'chirib bo'lmaydi - avval qarz to'lansin.
  if (
    await financePaymentService.hasOutstandingDebtInGroup(
      membership.studentId,
      group.id,
    )
  ) {
    throw new ApiError(
      400,
      "O'quvchining bu guruhda qarzi bor. Avval qarzni to'lang.",
    );
  }

  await prisma.groupMembership.update({
    where: { id: membership.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  try {
    await financePaymentService.recalcForStudentScope(membership.studentId, group.id, {});
  } catch (err) {
    logger.warn({ err }, "O'qish davri o'chirilganda to'lovlar qayta hisoblanmadi");
  }
  await safeRecomputeStudentCompletion(membership.studentId);
  return { id: membership.id, _id: membership.id };
};

// A'zolik yopilganda (chiqarish/ko'chirish) o'quvchining shu guruhdagi BARCHA oylik
// to'lovlarini (avans bilan yaratilgan kelgusi oylar ham) leftAt bo'yicha qayta
// proratsiya qiladi, so'ng o'qituvchi foiz maoshini yangilaydi (best-effort).
const recalcFinanceOnLeave = async (groupId, studentId) => {
  try {
    await financePaymentService.recalcForStudentScope(studentId, groupId, {});
    const today = localTodayMidnight();
    await teacherSalaryService.recalcForGroupMonth(
      groupId,
      today.getUTCFullYear(),
      today.getUTCMonth() + 1,
    );
  } catch (err) {
    logger.warn({ err }, "A'zolik yopilganda to'lovlar qayta hisoblanmadi");
  }
};

export const removeStudent = async (
  groupId,
  studentId,
  { reasonId, writeOff = false } = {},
  currentUser = null,
) => {
  const group = await ensureGroup(groupId);

  // Qarzli o'quvchini chiqarishda: writeOff=false bo'lsa 409 bilan qarz summasini
  // qaytaramiz - frontend "Yomon qarz" tasdiq modalini ko'rsatadi. writeOff=true
  // (admin tasdiqladi) bo'lsa qarz yomon qarz sifatida hisobdan chiqariladi.
  const debt = await financePaymentService.getOutstandingBreakdownInGroup(
    studentId,
    group.id,
  );
  if (debt.total > 0 && !writeOff) {
    throw new ApiError(409, "O'quvchida to'lanmagan qarz bor", {
      code: "OUTSTANDING_DEBT",
      details: { amount: debt.total, breakdown: debt.items },
    });
  }

  const leftAt = toUtcMidnight(new Date());

  // Dinamik chiqish sababi (ixtiyoriy) - snapshot title bilan birga yozamiz,
  // shunda sabab keyin o'chsa/o'zgarsa ham retention hisoboti buzilmaydi.
  const set = { leftAt, leftReason: "removed" };
  let leftReasonTitle = "";
  if (reasonId) {
    const reason = await prisma.archiveReason.findUnique({
      where: { id: String(reasonId) },
      select: { id: true, title: true },
    });
    if (!reason) throw new ApiError(400, "Chiqish sababi topilmadi");
    // `leftReasonDetail` - RELATION; ustun `leftReasonDetailId`.
    set.leftReasonDetailId = reason.id;
    // `leftReasonTitle` NOT NULL (@default("")) - null yozib bo'lmaydi.
    set.leftReasonTitle = reason.title || "";
    leftReasonTitle = set.leftReasonTitle;
  }

  // Mongo `findOneAndUpdate` shartni va yozuvni bitta amalda bajarardi.
  // Prisma'da `update` faqat unique kalit bo'yicha ishlaydi, shuning uchun
  // avval faol a'zolikni topamiz. Qisman unique indeks (groupId, studentId)
  // WHERE leftAt IS NULL kafolatlaydi: bunday qator ko'pi bilan BITTA.
  const open = await prisma.groupMembership.findFirst({
    where: { groupId: group.id, studentId: String(studentId), leftAt: null, isDeleted: false },
    select: { id: true },
  });
  if (!open) {
    throw new ApiError(404, "Faol a'zolik topilmadi");
  }
  const membership = await prisma.groupMembership.update({
    where: { id: open.id },
    data: set,
  });

  // Qarzni YOMON QARZ (write-off) sifatida yopamiz: recalcFinanceOnLeave'DAN OLDIN,
  // aks holda leftAt proratsiyasi qarz summasini o'zgartirib yuborardi. Write-off
  // qilingan to'lovlar keyingi recalc'da muzlaydi (qayta ochilmaydi).
  let writeOffResult = null;
  if (debt.total > 0 && writeOff) {
    writeOffResult = await financePaymentService.writeOffDebtInGroup(
      studentId,
      group.id,
      {
        membershipId: membership.id,
        currentUser,
        reasonTitle: leftReasonTitle,
      },
    );
  }

  // Ketgan o'quvchi endi to'liq oy uchun hisoblanmasin
  await recalcFinanceOnLeave(group.id, studentId);

  await safeRecomputeStudentCompletion(studentId);

  return { membership: withLegacyId(membership), writeOff: writeOffResult };
};

export const history = async (groupId, { page = 1, limit = 20 } = {}) => {
  const group = await ensureGroup(groupId);
  const where = { groupId: group.id };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.groupMembership.findMany({
      where,
      orderBy: { joinedAt: "desc" },
      skip,
      take: limit,
      include: {
        student: { select: safeUserProjection },
        transferredTo: { select: { id: true, name: true } },
      },
    }),
    prisma.groupMembership.count({ where }),
  ]);

  return { items: withLegacyIds(items), total, page, limit };
};

export const listForTeacher = async (teacherId) => {
  const { items } = await list({ teacherId, limit: 100, page: 1 });
  return items;
};

export const findActiveForStudent = async (studentId) => {
  const membership = await prisma.groupMembership.findFirst({
    where: {
      studentId: String(studentId),
      leftAt: null,
      isDeleted: false,
      // FILIAL: o'quvchi boshqa filialda ham guruhda bo'lsa, uning guruhi
      // shu filial ko'rinishiga chiqib ketmasin.
      ...(await branchGroupFilter("groupId")),
    },
    include: { group: { include: GROUP_INCLUDE } },
    orderBy: { joinedAt: "desc" },
  });

  if (!membership || !membership.group) return null;
  return {
    joinedAt: membership.joinedAt,
    group: shapeGroup(membership.group),
  };
};

// O'quvchining BARCHA active a'zoliklari (multi-active)
export const findAllActiveForStudent = async (studentId) => {
  const memberships = await prisma.groupMembership.findMany({
    where: {
      studentId: String(studentId),
      leftAt: null,
      isDeleted: false,
      ...(await branchGroupFilter("groupId")),
    },
    include: { group: { include: GROUP_INCLUDE } },
    orderBy: { joinedAt: "asc" },
  });

  return memberships
    .filter((m) => m.group)
    .map((m) => ({
      membershipId: m.id,
      joinedAt: m.joinedAt,
      group: shapeGroup(m.group),
    }));
};

// Guruhdan chiqarilgan o'quvchiga login qilganda bir marta ko'rsatiladigan
// xabar. Eng oxirgi "removed" a'zolikni qaytaradi, agar:
//  • hali ko'rilmagan bo'lsa (removalNoticeSeenAt = null), va
//  • o'quvchi o'sha guruhga hozir qayta a'zo bo'lmagan bo'lsa.
export const findPendingRemovalNotice = async (studentId) => {
  const membership = await prisma.groupMembership.findFirst({
    where: {
      studentId: String(studentId),
      leftReason: "removed",
      leftAt: { not: null },
      removalNoticeSeenAt: null,
      isDeleted: false,
    },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { leftAt: "desc" },
  });

  if (!membership || !membership.group) return null;

  // O'quvchi o'sha guruhga qayta faol a'zo bo'lganmi? Bo'lsa - xabar bermaymiz
  // (ammo seen ham qilmaymiz, chunki bu boshqa a'zolik yozuvi).
  const rejoined = await prisma.groupMembership.findFirst({
    where: {
      studentId: String(studentId),
      groupId: membership.group.id,
      leftAt: null,
      isDeleted: false,
    },
    select: { id: true },
  });
  if (rejoined) return null;

  return {
    membershipId: String(membership.id),
    groupName: membership.group.name,
    reasonTitle: membership.leftReasonTitle || "",
    leftAt: membership.leftAt,
  };
};

// Xabar ko'rilgan deb belgilaydi (modal yopilganda chaqiriladi). Faqat shu
// o'quvchining ko'rilmagan "removed" a'zoliklarini yopadi - shunda qayta
// login qilinganda modal chiqmaydi.
export const markRemovalNoticesSeen = async (studentId) => {
  await prisma.groupMembership.updateMany({
    where: {
      studentId: String(studentId),
      leftReason: "removed",
      removalNoticeSeenAt: null,
    },
    data: { removalNoticeSeenAt: new Date() },
  });
};
