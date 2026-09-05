// ─────────────────────────────────────────────────────────────────────────────
// O'QITUVCHI DAVOMATI ARXITEKTURASI (manba-haqiqat hujjati)
//
// Ikkita jadval ataylab ishlatiladi va ROLLARI HAR XIL:
//   1) TeacherAttendance  → MANBA-HAQIQAT. Har (teacher, dateKey) uchun bitta
//      kunlik yozuv. Holatlar: present | absent | excused ("exempt" YO'Q -
//      o'qituvchida imtiyoz tushunchasi bo'lmaydi). Owner shu yerda belgilaydi.
//   2) TeacherAbsence     → PROYEKSIYA. Bu yozuvdan kelib chiqib, dars kuni
//      bo'lgan har bir GURUH uchun "o'qituvchi kelmadi" belgisi
//      (maosh/chegirma hisobiga). `syncTeacherGroupAbsences()` orqali
//      TeacherAttendance'dan AVTOMATIK hosil qilinadi — uni mustaqil
//      "haqiqat" sifatida YOZMANG.
//
// Ya'ni: yoz → TeacherAttendance; o'qi (guruh darajasi) → TeacherAbsence.
// Kelajak-kun qo'riqlovi student davomati bilan bir xil: localTodayKey
// (Asia/Tashkent). To'liq bitta modelga birlashtirish maosh hisobiga ta'sir
// qilgani uchun ataylab QILINMAGAN.
// ─────────────────────────────────────────────────────────────────────────────
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES, TEACHER_ATTENDANCE_STATUSES } from '../../common/constants/permissions.js';
import {
  dateKeyOf,
  dayOfWeekOf,
  localTodayKey,
  parseLocalDay,
} from '../../common/utils/date.js';
import { scheduleActiveOn } from '../../common/utils/attendance.js';
import { userBranchCondition } from '../../common/als/branch-context.js';
import { TeacherAbsenceService } from '../attendance/teacher-absence.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-request.js';

const TEACHER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
};

export interface BulkItem {
  teacherId: string;
  status: string;
  reason?: string;
}

/** Shu sanada AMAL QILGAN jadval versiyasi bo'yicha (versiyalash). */
const isClassDayFor = (
  group: { schedule?: unknown[] },
  dow: string,
  date: Date | null = null,
): boolean =>
  scheduleActiveOn(group.schedule as never, date as never)
    .some((s: { day: string }) => s.day === dow);

@Injectable()
export class TeacherAttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly absences: TeacherAbsenceService,
  ) {}

  /**
   * O'qituvchi kunlik davomatini uning barcha (faol, yakunlanmagan)
   * guruhlaridagi "o'qituvchi keldi/kelmadi" bilan moslaydi. Kelmadi →
   * dars kuni bo'lgan guruhlarga "kelmadi" yoziladi; keldi → o'sha
   * guruhlardagi belgilar olib tashlanadi.
   */
  private async syncTeacherGroupAbsences(
    teacherId: string,
    date: Date,
    isAbsent: boolean,
    currentUser: AuthenticatedUser,
  ) {
    const dow = dayOfWeekOf(date);
    // `teachers: teacherId` Mongo'da massivga tegishlilik tekshiruvi edi.
    // Prisma'da bu KO'P-KO'PGA bog'lanish, ya'ni `some` relation filtri.
    //
    // ⚠ `schedule` MAJBURIY `include`: Mongo'da u hujjat ichidagi massiv
    // edi, Prisma'da esa alohida jadval. So'ralmasa `isClassDayFor` doim
    // `false` qaytarib, "kelmadi" belgisi HECH QACHON yozilmasdi.
    const groups = await this.prisma.group.findMany({
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
        // dars kuni bo'lmasa o'tkazib yuboramiz
        if (!isClassDayFor(g as never, dow, date)) continue;
        // eslint-disable-next-line no-await-in-loop
        await this.absences.setAbsent(g.id, date, currentUser);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await this.absences.setPresent(g.id, date);
      }
    }
  }

  /**
   * Sana uchun barcha faol o'qituvchilar + holati (yozuv bo'lmasa
   * default "keldi").
   */
  async listForDate(dateInput: unknown) {
    // Mahalliy (Asia/Tashkent) kalendar kuni - UTC bilan kun siljimasin
    // (A-2 parity).
    const date = parseLocalDay(dateInput as string);
    if (!date) throw new ApiError(400, "Sana noto'g'ri");
    // ⚠ `dateKeyOf` `string | null` qaytaradi (noto'g'ri kirish uchun),
    // lekin bu yerda `parseLocalDay` allaqachon HAQIQIY `Date` bergan —
    // demak `null` MUMKIN EMAS. Yangi xato yo'li QO'SHILMAYDI: Express
    // ham bu holatni ko'rmaydi, qo'shilsa xatti-harakat ajralib ketardi.
    const dateKey = dateKeyOf(date) as string;

    // FILIAL: o'qituvchi ro'yxati ko'lamsiz edi — filial direktori BUTUN
    // markazning o'qituvchilarini ko'rardi. `userBranchCondition()` `AND`
    // ichida: foydalanuvchi filialga IKKI yo'l bilan bog'lanadi
    // (homeBranchId / branchAssignments) va shart OR shaklida qaytadi.
    const branchCond = userBranchCondition();
    const teachers = await this.prisma.user.findMany({
      where: {
        role: ROLES.TEACHER,
        isActive: true,
        isDeleted: false,
        ...(branchCond ? { AND: [branchCond] } : {}),
      },
      select: TEACHER_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    // FILIAL: `TeacherAttendance` da `branchId` YO'Q — yozuv O'QITUVCHIGA
    // tegishli. Shuning uchun yozuvlar ham SHU ro'yxat bilan cheklanadi:
    // begona filial qatori umuman o'qilmasin.
    const scopedTeacherIds = teachers.map((t) => String(t.id));
    const records = await this.prisma.teacherAttendance.findMany({
      where: { dateKey, isDeleted: false, teacherId: { in: scopedTeacherIds } },
      select: { teacherId: true, status: true, reason: true },
    });
    const map = new Map(records.map((r) => [String(r.teacherId), r]));

    // ⚠ Javobda `teacher._id` QOLADI — klient jadvali shunga tayangan.
    // Bu `withLegacyId` EMAS: bu yerda ATAYLAB faqat `_id` beriladi,
    // `id` esa umuman qaytmaydi.
    const rows = teachers.map((t) => {
      const r = map.get(String(t.id));
      return {
        teacher: { _id: t.id, firstName: t.firstName, lastName: t.lastName },
        status: r?.status || 'present',
        reason: r?.reason || '',
      };
    });
    return { date, dateKey, rows };
  }

  /**
   * Bulk saqlash. "present" - yozuv o'chiriladi (default holatga
   * qaytadi), "absent"/"excused" - upsert qilinadi.
   */
  async bulkRecord(
    dateInput: unknown,
    items: BulkItem[],
    currentUser: AuthenticatedUser,
  ) {
    // Mahalliy (Asia/Tashkent) kalendar kuni - yozuv kalitlari student
    // davomati bilan bir xil bo'lishi shart (A-2 parity).
    const date = parseLocalDay(dateInput as string);
    if (!date) throw new ApiError(400, "Sana noto'g'ri");
    // `parseLocalDay` haqiqiy `Date` bergan — `null` mumkin emas
    // (yuqoridagi izoh).
    const dateKey = dateKeyOf(date) as string;
    // Kelajak kun uchun davomat belgilanmaydi (o'tmishni tuzatish
    // mumkin). "Bugun" - mahalliy (Asia/Tashkent) kun.
    // `localTodayKey()` ham `string | null` deb e'lon qilingan, lekin u
    // `localTodayMidnight()` dan hosil bo'ladi va u DOIM haqiqiy `Date`.
    if (dateKey > (localTodayKey() as string)) {
      throw new ApiError(400, "Kelajak kun uchun davomat belgilab bo'lmaydi");
    }
    if (!Array.isArray(items) || !items.length) {
      throw new ApiError(400, "Hech bo'lmaganda bitta yozuv kerak");
    }

    // Har bir teacherId haqiqiy o'qituvchi ekanini tekshiramiz -
    // ixtiyoriy ID (o'quvchi, yo'q user) uchun davomat yozuvi
    // yaratilmasin.
    //
    // FILIAL: ko'lamdan TASHQARIDAGI o'qituvchi ham "noto'g'ri" sanaladi.
    // Usiz filial direktori BEGONA filial o'qituvchisini "kelmadi" deb
    // belgilab, `TeacherAbsence` orqali uning MAOSHIGA ta'sir qilardi.
    const teacherIds = [...new Set(items.map((i) => String(i.teacherId)))];
    const branchCond = userBranchCondition();
    const validCount = await this.prisma.user.count({
      where: {
        id: { in: teacherIds },
        role: ROLES.TEACHER,
        ...(branchCond ? { AND: [branchCond] } : {}),
      },
    });
    if (validCount !== teacherIds.length) {
      throw new ApiError(400, "Bir yoki bir nechta o'qituvchi noto'g'ri");
    }

    let marked = 0;
    let present = 0;
    for (const it of items) {
      if (!TEACHER_ATTENDANCE_STATUSES.includes(it.status)) continue;
      if (it.status === 'present') {
        // `deleteMany` - `delete` Prisma'da unique kalit talab qiladi
        // va yozuv topilmasa OTADI. Bu yerda "yo'q bo'lsa ham mayli"
        // xulqi kerak (Mongo `deleteOne` shunday edi).
        // eslint-disable-next-line no-await-in-loop
        await this.prisma.teacherAttendance.deleteMany({
          where: { teacherId: String(it.teacherId), dateKey },
        });
        // Keldi → barcha guruhlardagi "kelmadi" belgilarini olib tashlaymiz
        // eslint-disable-next-line no-await-in-loop
        await this.syncTeacherGroupAbsences(it.teacherId, date, false, currentUser);
        present += 1;
      } else {
        // `(teacherId, dateKey)` unique - `upsert` to'g'ridan-to'g'ri
        // ishlaydi (qisman indeks emas, shuning uchun find-then-write
        // kerak emas).
        const payload = {
          date,
          status: it.status as never,
          reason: it.reason || '',
          recordedById: currentUser?.id ? String(currentUser.id) : null,
          recordedAt: new Date(),
          // Qayta belgilanganda eski "o'chirilgan" holat tiklanadi -
          // aks holda soft-delete qilingan yozuv ustiga yozilib,
          // ro'yxatda ko'rinmay qolardi.
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
        };
        // eslint-disable-next-line no-await-in-loop
        await this.prisma.teacherAttendance.upsert({
          where: {
            teacherId_dateKey: { teacherId: String(it.teacherId), dateKey },
          },
          create: { teacherId: String(it.teacherId), dateKey, ...payload },
          update: payload,
        });
        // Kelmadi/sababli → o'qituvchining dars kuni bo'lgan barcha
        // guruhlari "kelmadi"
        // eslint-disable-next-line no-await-in-loop
        await this.syncTeacherGroupAbsences(it.teacherId, date, true, currentUser);
        marked += 1;
      }
    }
    return { dateKey, marked, present, total: items.length };
  }
}
