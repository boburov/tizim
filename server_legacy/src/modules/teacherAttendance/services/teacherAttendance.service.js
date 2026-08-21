// ─────────────────────────────────────────────────────────────────────────────
// O'QITUVCHI DAVOMATI ARXITEKTURASI (manba-haqiqat hujjati)
//
// Ikkita kolleksiya ataylab ishlatiladi va ROLLARI HAR XIL:
//   1) TeacherAttendance  → MANBA-HAQIQAT. Har (teacher, dateKey) uchun bitta
//      kunlik yozuv. Holatlar: present | absent | excused ("exempt" YO'Q -
//      o'qituvchida imtiyoz tushunchasi bo'lmaydi). Owner shu yerda belgilaydi.
//   2) TeacherAbsence     → PROYEKSIYA. Bu yozuvdan kelib chiqib, dars kuni bo'lgan
//      har bir GURUH uchun "o'qituvchi kelmadi" belgisi (maosh/chegirma hisobiga).
//      syncTeacherGroupAbsences() orqali TeacherAttendance'dan AVTOMATIK hosil
//      qilinadi - uni mustaqil "haqiqat" sifatida YOZMANG.
//
// Ya'ni: yoz → TeacherAttendance; o'qi (guruh darajasi) → TeacherAbsence (derived).
// Kelajak-kun qo'riqlovi student davomati bilan bir xil: localTodayKey (Asia/Tashkent).
// To'liq bitta modelga birlashtirish maosh hisobiga ta'sir qilgani uchun ataylab
// QILINMAGAN (parity + hujjat yondashuvi).
// ─────────────────────────────────────────────────────────────────────────────
import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { TEACHER_ATTENDANCE_STATUSES } from "../../../constants/teacherAttendance.js";
import {
  dateKeyOf,
  dayOfWeekOf,
  localTodayKey,
  parseLocalDay,
  scheduleActiveOn,
} from "../../../helpers/attendance.helper.js";
import {
  setAbsent as setGroupTeacherAbsent,
  setPresent as setGroupTeacherPresent,
} from "../../attendance/services/teacherAbsence.service.js";

const TEACHER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
};

// Shu sanada AMAL QILGAN jadval versiyasi bo'yicha (versiyalash)
const isClassDayFor = (group, dow, date = null) =>
  scheduleActiveOn(group.schedule, date).some((s) => s.day === dow);

// O'qituvchi kunlik davomatini uning barcha (faol, yakunlanmagan) guruhlaridagi
// "o'qituvchi keldi/kelmadi" bilan moslaydi. Kelmadi → dars kuni bo'lgan guruhlarga
// "kelmadi" yoziladi; keldi → o'sha guruhlardagi belgilar olib tashlanadi.
const syncTeacherGroupAbsences = async (teacherId, date, isAbsent, currentUser) => {
  const dow = dayOfWeekOf(date);
  // `teachers: teacherId` Mongo'da massivga tegishlilik tekshiruvi edi.
  // Prisma'da bu KO'P-KO'PGA bog'lanish, ya'ni `some` relation filtri.
  //
  // `schedule` MAJBURIY `include`: Mongo'da u hujjat ichidagi massiv
  // edi, Prisma'da esa alohida jadval. So'ralmasa `isClassDayFor` doim
  // `false` qaytarib, "kelmadi" belgisi HECH QACHON yozilmasdi.
  const groups = await prisma.group.findMany({
    where: {
      teachers: { some: { id: String(teacherId) } },
      isActive: true,
      isDeleted: false,
    },
    select: {
      id: true,
      schedule: {
        select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
      },
    },
  });
  for (const g of groups) {
    if (isAbsent) {
      if (!isClassDayFor(g, dow, date)) continue; // dars kuni bo'lmasa o'tkazib yuboramiz
      await setGroupTeacherAbsent(g.id, date, currentUser);
    } else {
      await setGroupTeacherPresent(g.id, date);
    }
  }
};

// Sana uchun barcha faol o'qituvchilar + holati (yozuv bo'lmasa default "keldi")
export const listForDate = async (dateInput) => {
  // Mahalliy (Asia/Tashkent) kalendar kuni - UTC bilan kun siljimasin (A-2 parity)
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dateKey = dateKeyOf(date);

  const teachers = await prisma.user.findMany({
    where: { role: ROLES.TEACHER, isActive: true, isDeleted: false },
    select: TEACHER_SELECT,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  const records = await prisma.teacherAttendance.findMany({
    where: { dateKey, isDeleted: false },
    select: { teacherId: true, status: true, reason: true },
  });
  const map = new Map(records.map((r) => [String(r.teacherId), r]));

  // Javobda `teacher._id` QOLADI - klient jadvali shunga tayangan.
  const rows = teachers.map((t) => {
    const r = map.get(String(t.id));
    return {
      teacher: { _id: t.id, firstName: t.firstName, lastName: t.lastName },
      status: r?.status || "present",
      reason: r?.reason || "",
    };
  });
  return { date, dateKey, rows };
};

// Bulk saqlash. "present" - yozuv o'chiriladi (default holatga qaytadi),
// "absent"/"excused" - upsert qilinadi.
export const bulkRecord = async (dateInput, items, currentUser) => {
  // Mahalliy (Asia/Tashkent) kalendar kuni - yozuv kalitlari student davomati
  // bilan bir xil bo'lishi shart (A-2 parity)
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dateKey = dateKeyOf(date);
  // Kelajak kun uchun davomat belgilanmaydi (o'tmishni tuzatish mumkin).
  // "Bugun" - mahalliy (Asia/Tashkent) kun, student davomati bilan bir xil.
  if (dateKey > localTodayKey()) {
    throw new ApiError(400, "Kelajak kun uchun davomat belgilab bo'lmaydi");
  }
  if (!Array.isArray(items) || !items.length) {
    throw new ApiError(400, "Hech bo'lmaganda bitta yozuv kerak");
  }

  // Har bir teacherId haqiqiy o'qituvchi ekanini tekshiramiz - ixtiyoriy
  // ObjectId (o'quvchi, yo'q user) uchun davomat yozuvi yaratilmasin.
  const teacherIds = [...new Set(items.map((i) => String(i.teacherId)))];
  const validCount = await prisma.user.count({
    where: { id: { in: teacherIds }, role: ROLES.TEACHER },
  });
  if (validCount !== teacherIds.length) {
    throw new ApiError(400, "Bir yoki bir nechta o'qituvchi noto'g'ri");
  }

  let marked = 0;
  let present = 0;
  for (const it of items) {
    if (!TEACHER_ATTENDANCE_STATUSES.includes(it.status)) continue;
    if (it.status === "present") {
      // `deleteMany` - `deleteOne` Prisma'da unique kalit talab qiladi
      // va yozuv topilmasa OTADI. Bu yerda "yo'q bo'lsa ham mayli"
      // xulqi kerak (Mongo `deleteOne` shunday edi).
      await prisma.teacherAttendance.deleteMany({
        where: { teacherId: String(it.teacherId), dateKey },
      });
      // Keldi → barcha guruhlardagi "kelmadi" belgilarini olib tashlaymiz
      await syncTeacherGroupAbsences(it.teacherId, date, false, currentUser);
      present += 1;
    } else {
      // `(teacherId, dateKey)` unique - `upsert` to'g'ridan-to'g'ri
      // ishlaydi (qisman indeks emas, shuning uchun find-then-write
      // kerak emas).
      const payload = {
        date,
        status: it.status,
        reason: it.reason || "",
        recordedById: currentUser?._id ? String(currentUser._id) : null,
        recordedAt: new Date(),
        // Qayta belgilanganda eski "o'chirilgan" holat tiklanadi -
        // aks holda soft-delete qilingan yozuv ustiga yozilib,
        // ro'yxatda ko'rinmay qolardi.
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      };
      await prisma.teacherAttendance.upsert({
        where: {
          teacherId_dateKey: { teacherId: String(it.teacherId), dateKey },
        },
        create: { teacherId: String(it.teacherId), dateKey, ...payload },
        update: payload,
      });
      // Kelmadi/sababli → o'qituvchining dars kuni bo'lgan barcha guruhlari "kelmadi"
      await syncTeacherGroupAbsences(it.teacherId, date, true, currentUser);
      marked += 1;
    }
  }
  return { dateKey, marked, present, total: items.length };
};
