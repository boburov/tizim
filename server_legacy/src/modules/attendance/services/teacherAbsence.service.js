// PROYEKSIYA xizmati: TeacherAbsence (per-guruh "o'qituvchi kelmadi") yozuvlari
// TeacherAttendance (manba-haqiqat) dan teacherAttendance.service orqali hosil
// qilinadi - maosh/chegirma hisobiga ishlatiladi. Mustaqil haqiqat sifatida
// qaramang. To'liq tafsilot: modules/teacherAttendance/services/teacherAttendance.service.js
import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId } from "../../../utils/serialize.js";
import {
  parseLocalDay,
  dateKeyOf,
  dayOfWeekOf,
  scheduleActiveOn,
  localTodayMidnight,
} from "../../../helpers/attendance.helper.js";

// JADVAL ALOHIDA JADVALDA. Mongo'da `schedule` guruh hujjati ichidagi
// massiv edi va `Group.findById` bilan o'zi kelardi. Prisma'da u
// `GroupScheduleItem` - `include` qilinmasa `undefined` bo'ladi va
// `scheduleActiveOn` bo'sh massiv qaytarib, HAR KUN "dars kuni emas"
// bo'lib qolardi (o'qituvchi kelmagani hech qachon yozilmasdi).
const GROUP_WITH_SCHEDULE = {
  id: true,
  teachers: { select: { id: true } },
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
};

const parseDay = (dateInput) => {
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  return date;
};

// Shu sanada AMAL QILGAN jadval versiyasi bo'yicha (versiyalash)
const isClassDayFor = (group, dow, date = null) =>
  scheduleActiveOn(group.schedule, date).some((s) => s.day === dow);

const loadGroup = async (groupId) => {
  const group = await prisma.group.findUnique({
    where: { id: String(groupId) },
    select: GROUP_WITH_SCHEDULE,
  });
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  return group;
};

// O'qituvchi shu kuni keldimi (faqat fakt - o'quvchilar hisobiga ta'sir qilmaydi)
export const getStatus = async (groupId, dateInput) => {
  const group = await loadGroup(groupId);
  const date = parseDay(dateInput);
  const dKey = dateKeyOf(date);
  const absence = await prisma.teacherAbsence.findFirst({
    where: { groupId: String(groupId), dateKey: dKey, isDeleted: false },
    select: { id: true },
  });
  return {
    dateKey: dKey,
    isClassDay: isClassDayFor(group, dayOfWeekOf(date), date),
    present: !absence,
  };
};

// O'qituvchi kelmadi - faqat belgilab qo'yiladi. O'quvchilar to'loviga TEGMAYDI.
// Jarima kerak bo'lsa, admin o'qituvchi maoshiga qo'lda yozadi (individual).
export const setAbsent = async (groupId, dateInput, currentUser) => {
  const group = await loadGroup(groupId);
  const date = parseDay(dateInput);
  const dKey = dateKeyOf(date);
  // Kelajak sanaga "kelmadi" yozib bo'lmaydi (bulkRecord bilan bir xil qoida)
  if (date.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Kelajak sanaga davomat belgilab bo'lmaydi");
  }
  if (!isClassDayFor(group, dayOfWeekOf(date), date)) {
    throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
  }

  const existing = await prisma.teacherAbsence.findFirst({
    where: { groupId: String(groupId), dateKey: dKey },
  });
  if (existing) return withLegacyId(existing);

  // POYGA HIMOYASI: `(groupId, dateKey)` unique. Ikki so'rov bir vaqtda
  // kelsa ikkinchisi P2002 bilan yiqilardi - bu XATO EMAS, yozuv
  // baribir bor. Mongo'da bu `11000` kodi edi.
  try {
    const created = await prisma.teacherAbsence.create({
      data: {
        groupId: String(groupId),
        teacherId: group.teachers?.[0]?.id || null,
        date,
        dateKey: dKey,
        recordedById: String(currentUser._id),
      },
    });
    return withLegacyId(created);
  } catch (err) {
    if (err?.code !== "P2002") throw err;
    const again = await prisma.teacherAbsence.findFirst({
      where: { groupId: String(groupId), dateKey: dKey },
    });
    return again ? withLegacyId(again) : null;
  }
};

// O'qituvchi keldi - belgini olib tashlaymiz.
export const setPresent = async (groupId, dateInput) => {
  const date = parseDay(dateInput);
  const dKey = dateKeyOf(date);
  const res = await prisma.teacherAbsence.deleteMany({
    where: { groupId: String(groupId), dateKey: dKey },
  });
  return { removed: res.count > 0 };
};

export const toggle = async (groupId, dateInput, present, currentUser) =>
  present
    ? setPresent(groupId, dateInput)
    : setAbsent(groupId, dateInput, currentUser);
