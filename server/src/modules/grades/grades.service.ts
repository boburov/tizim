import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { ApiError } from '../../common/errors/api-error.js';
import { parseLocalDay, dateKeyOf, dayOfWeekOf } from '../../common/utils/date.js';
import { scheduleActiveOn } from '../../common/utils/attendance.js';

/**
 * BAHOLAR — `grades.service.js` NING AYNAN EKVIVALENTI.
 *
 * ⚠ `currentUser._id` → `actorId(currentUser)`: Express `req.user` ga
 * `_id` taxallusini ochiq qo'yadi (`auth.js`), NestJS esa `id` beradi.
 * Ikkalasi ham qabul qilinadi — faqat bittasiga tayanish
 * `recordedById` ni jimgina `"undefined"` SATRIGA aylantirardi va
 * audit izi buzilardi.
 */

interface Actor { id?: string | null; _id?: string | null }
const actorId = (u?: Actor | null): string => String(u?.id || u?._id || '');

const STUDENT_SELECT = {
  // `id` ATAYLAB: Prisma `select` bilan uni avtomatik qaytarmaydi,
  // klient esa o'quvchini `_id` bo'yicha ochadi.
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
};

// JADVAL ALOHIDA JADVALDA. Mongo'da `schedule` guruh hujjati ichidagi
// massiv edi; `select` qilinmasa `sessionsForDay` bo'sh qaytarib,
// dars sessiyalari YO'QOLARDI.
const GROUP_WITH_SCHEDULE = {
  id: true,
  name: true,
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
};

export interface Session {
  slot: string;
  startTime: string;
  endTime: string;
}

/**
 * Kunning sessiyalari (davomat bilan bir xil ta'rif): bir slotli kun →
 * ""; ko'p slotli kun → slot=startTime.
 */
const sessionsForDay = (
  group: { schedule?: unknown[] },
  dow: string,
  date: Date | null = null,
): Session[] => {
  // Shu sanada AMAL QILGAN jadval versiyasi (versiyalash) - davomat
  // bilan bir xil.
  const daySlots = (scheduleActiveOn(group.schedule as never, date as never) as {
    day: string; startTime: string; endTime: string;
  }[])
    .filter((s) => s.day === dow)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
  const multi = daySlots.length > 1;
  return daySlots.map((s) => ({
    slot: multi ? s.startTime : '',
    startTime: s.startTime,
    endTime: s.endTime,
  }));
};

const validateItem = (item: { studentId?: string; value?: unknown }) => {
  if (!item.studentId) throw new ApiError(400, "O'quvchi kerak");
  const v = Number(item.value);
  if (!Number.isInteger(v) || v < 1 || v > 5) {
    throw new ApiError(400, "Ball 1 dan 5 gacha bo'lishi kerak");
  }
};

export interface GradeItem {
  studentId: string;
  value: number;
  comment?: string;
}

@Injectable()
export class GradesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async ensureGroup(groupId: string) {
    const g = await this.prisma.group.findUnique({
      where: { id: String(groupId) },
      select: GROUP_WITH_SCHEDULE,
    });
    if (!g) throw new ApiError(404, 'Guruh topilmadi');
    return g;
  }

  /**
   * Berilgan sanada guruhning aktiv a'zolari (davomat roster filtri
   * bilan bir xil).
   */
  private activeMembersOn(groupId: string, date: Date) {
    const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.groupMembership.findMany({
      where: {
        groupId: String(groupId),
        joinedAt: { lt: dayEnd },
        OR: [{ leftAt: null }, { leftAt: { gt: date } }],
        isDeleted: false,
      },
      select: { studentId: true, student: { select: STUDENT_SELECT } },
    });
  }

  // ─── Guruh + sana uchun baholash ro'yxati (mavjud ballar bilan) ───
  async listForGroupOnDate(
    groupId: string,
    dateInput: unknown,
    slotInput: string | null = null,
  ) {
    const group = await this.ensureGroup(groupId);
    const date = parseLocalDay(dateInput as string);
    if (!date) throw new ApiError(400, "Sana noto'g'ri");
    const dow = dayOfWeekOf(date);
    const sessions = sessionsForDay(group as never, dow, date);
    const selectedSlot =
      slotInput !== null && slotInput !== undefined
        ? slotInput
        : sessions[0]?.slot ?? '';

    const memberships = await this.activeMembersOn(groupId, date);
    const studentIds = memberships
      .filter((m) => m.student)
      .map((m) => m.student!.id);

    const dKey = dateKeyOf(date) as string;
    const grades = await this.prisma.grade.findMany({
      where: {
        groupId: String(groupId),
        studentId: { in: studentIds },
        dateKey: dKey,
        slot: selectedSlot,
        isDeleted: false,
      },
    });
    const gradeMap = new Map<string, unknown>();
    for (const g of grades) gradeMap.set(String(g.studentId), g);

    const rows = memberships
      .filter((m) => m.student)
      .map((m) => {
        const g = gradeMap.get(String(m.student!.id)) || null;
        // Prisma oddiy obyekt qaytaradi (Mongoose hujjati emas).
        // Javobda `_id` QOLADI: klient o'quvchini shu bo'yicha ajratadi.
        return {
          student: withLegacyId(m.student),
          grade: g ? withLegacyId(g as Record<string, unknown>) : null,
        };
      });

    return {
      group: { _id: group.id, name: group.name, schedule: group.schedule },
      date,
      dateKey: dKey,
      sessions,
      slot: selectedSlot,
      isClassDay: sessions.length > 0,
      rows,
    };
  }

  // ─── Guruh + sana uchun ballarni bulk saqlash (upsert + audit) ───
  async bulkRecord(
    groupId: string,
    dateInput: unknown,
    items: GradeItem[],
    currentUser: Actor,
    slot: string | null = null,
  ) {
    const group = await this.ensureGroup(groupId);
    const date = parseLocalDay(dateInput as string);
    if (!date) throw new ApiError(400, "Sana noto'g'ri");
    const dKey = dateKeyOf(date) as string;
    const dow = dayOfWeekOf(date);
    const sessions = sessionsForDay(group as never, dow, date);
    if (sessions.length === 0) {
      throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
    }
    const normalizedSlot =
      sessions.length > 1 ? slot || sessions[0].slot : '';
    if (
      sessions.length > 1 &&
      !sessions.some((s) => s.slot === normalizedSlot)
    ) {
      throw new ApiError(400, "Sessiya (dars vaqti) noto'g'ri");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, "Hech bo'lmaganda bitta ball kerak");
    }
    for (const item of items) validateItem(item);

    // Har bir o'quvchi shu sanada guruhning aktiv a'zosi ekanini
    // tekshiramiz.
    const studentIds = items.map((it) => it.studentId);
    const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const activeMembers = await this.prisma.groupMembership.findMany({
      where: {
        groupId: String(groupId),
        studentId: { in: studentIds.map(String) },
        joinedAt: { lt: dayEnd },
        OR: [{ leftAt: null }, { leftAt: { gt: date } }],
        isDeleted: false,
      },
      select: { studentId: true },
    });
    const memberSet = new Set(activeMembers.map((m) => String(m.studentId)));
    for (const item of items) {
      if (!memberSet.has(String(item.studentId))) {
        throw new ApiError(400, "O'quvchi bu sanada guruhning aktiv a'zosi emas");
      }
    }

    // Audit uchun mavjud ballarni oldindan olamiz.
    const existing = await this.prisma.grade.findMany({
      where: {
        groupId: String(groupId),
        studentId: { in: studentIds.map(String) },
        dateKey: dKey,
        slot: normalizedSlot,
        isDeleted: false,
      },
    });
    const existingMap = new Map<string, { id: string; value: number; history: unknown }>();
    for (const g of existing) {
      existingMap.set(String(g.studentId), g as never);
    }

    /**
     * TRANZAKSIYA — HAQIQIY.
     *
     * Mongo'da `startSession()` standalone o'rnatmada jimgina
     * atomiklikni yo'qotardi (replica set bo'lmasa tranzaksiya
     * qo'llab-quvvatlanmaydi). PostgreSQL'da `$transaction` har doim
     * haqiqiy: bir nechta o'quvchining bahosi yo hammasi yoziladi, yo
     * hech biri — yarim yozilgan varaq qolmaydi.
     *
     * QISMAN UNIQUE INDEKS: `(groupId, studentId, dateKey, slot)` faqat
     * `WHERE isDeleted = false` uchun amal qiladi. Prisma `upsert`
     * bunday indeksni ISHLATA OLMAYDI (u to'liq unique kalit talab
     * qiladi), shuning uchun find-then-write + P2002 qayta urinish.
     */
    const docs = await this.prisma.$transaction(async (tx) => {
      const out: unknown[] = [];
      for (const item of items) {
        const prev = existingMap.get(String(item.studentId));
        const value = Number(item.value);
        const changed = !prev || prev.value !== value;

        // `$push` o'rni: `history` ustuni `Json`, massiv JS'da yig'iladi.
        const history = Array.isArray(prev?.history) ? [...(prev!.history as unknown[])] : [];
        if (changed) {
          history.push({
            at: new Date(),
            by: actorId(currentUser),
            from: prev ? prev.value : null,
            to: value,
            source: 'teacher',
          });
        }

        const data = {
          value,
          comment: item.comment || '',
          recordedById: actorId(currentUser),
          recordedAt: new Date(),
          source: 'teacher' as never,
          isDeleted: false,
          history: history as never,
        };

        let doc: unknown = null;
        if (prev) {
          // eslint-disable-next-line no-await-in-loop
          doc = await tx.grade.update({ where: { id: prev.id }, data });
        } else {
          try {
            // eslint-disable-next-line no-await-in-loop
            doc = await tx.grade.create({
              data: {
                groupId: String(groupId),
                studentId: String(item.studentId),
                date,
                dateKey: dKey,
                slot: normalizedSlot,
                ...data,
              },
            });
          } catch (err) {
            // POYGA: ikki o'qituvchi bir vaqtda baholasa. Mongo'da bu
            // `11000` edi, Prisma'da `P2002` — yozuv baribir bor,
            // ustiga yozamiz.
            if ((err as { code?: string })?.code !== 'P2002') throw err;
            // eslint-disable-next-line no-await-in-loop
            const again = await tx.grade.findFirst({
              where: {
                groupId: String(groupId),
                studentId: String(item.studentId),
                dateKey: dKey,
                slot: normalizedSlot,
                isDeleted: false,
              },
            });
            doc = again
              // eslint-disable-next-line no-await-in-loop
              ? await tx.grade.update({ where: { id: again.id }, data })
              : null;
          }
        }
        if (doc) out.push(doc);
      }
      return out;
    });

    return { count: docs.length, slot: normalizedSlot };
  }

  // ─── Guruh summary: o'rtacha ball + tarqalish (1..5) ───
  async getGroupSummary(
    groupId: string,
    { fromDate, toDate }: { fromDate?: unknown; toDate?: unknown },
  ) {
    await this.ensureGroup(groupId);
    const from = parseLocalDay(fromDate as string);
    const to = parseLocalDay(toDate as string);
    if (!from || !to) throw new ApiError(400, "Sana noto'g'ri");
    const fromKey = dateKeyOf(from) as string;
    const toKey = dateKeyOf(to) as string;

    const grades = await this.prisma.grade.findMany({
      where: {
        groupId: String(groupId),
        dateKey: { gte: fromKey, lte: toKey },
        isDeleted: false,
      },
      select: { value: true, student: { select: STUDENT_SELECT } },
    });

    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const byStudent = new Map<string, { student: unknown; sum: number; count: number }>();
    let sum = 0;
    for (const g of grades) {
      dist[g.value] = (dist[g.value] || 0) + 1;
      sum += g.value;
      if (!g.student) continue;
      const sid = String(g.student.id);
      if (!byStudent.has(sid)) {
        byStudent.set(sid, { student: g.student, sum: 0, count: 0 });
      }
      const e = byStudent.get(sid)!;
      e.sum += g.value;
      e.count += 1;
    }

    const perStudent = Array.from(byStudent.values())
      .map((e) => ({
        student: e.student,
        average: e.count ? Math.round((e.sum / e.count) * 100) / 100 : null,
        count: e.count,
      }))
      .sort((a, b) => (b.average || 0) - (a.average || 0));

    const average = grades.length
      ? Math.round((sum / grades.length) * 100) / 100
      : null;

    return { average, total: grades.length, distribution: dist, perStudent };
  }

  // ─── O'quvchi summary: o'rtacha ball + oxirgi ballar ───
  async getStudentSummary(
    studentId: string,
    { fromDate, toDate, scopeGroupIds }: {
      fromDate?: unknown; toDate?: unknown; scopeGroupIds?: string[] | null;
    } = {},
  ) {
    const where: Record<string, unknown> = {
      studentId: String(studentId), isDeleted: false,
    };
    if (fromDate && toDate) {
      where.dateKey = {
        gte: dateKeyOf(parseLocalDay(fromDate as string) as Date),
        lte: dateKeyOf(parseLocalDay(toDate as string) as Date),
      };
    }
    // `group` -> `groupId`: Prisma'da `group` RELATION.
    //
    // ⚠ `scopeGroupIds` GUARD'DAN keladi (`StudentAccessGuard`). Uni
    // uzatishni unutish A-1 "cross-group disclosure" xatosini
    // QAYTARARDI: o'qituvchi o'zi o'qitmaydigan guruhdagi ballarni ham
    // ko'rib qolardi.
    if (Array.isArray(scopeGroupIds)) {
      where.groupId = { in: scopeGroupIds.map(String) };
    }
    const grades = await this.prisma.grade.findMany({
      where: where as never,
      select: {
        id: true,
        value: true,
        dateKey: true,
        comment: true,
        group: { select: { id: true, name: true } },
      },
      orderBy: { dateKey: 'desc' },
    });

    const count = grades.length;
    const sum = grades.reduce((acc, g) => acc + g.value, 0);
    const average = count ? Math.round((sum / count) * 100) / 100 : null;

    return {
      average,
      count,
      // Javobda `_id` QOLADI - klient shunga tayangan.
      recent: grades.slice(0, 20).map((g) => ({
        _id: g.id,
        value: g.value,
        dateKey: g.dateKey,
        comment: g.comment || '',
        group: g.group ? { _id: g.group.id, name: g.group.name } : null,
      })),
    };
  }

  // ─── Reyting uchun: bir nechta o'quvchining o'rtacha balli ───
  async averagesForStudents(
    studentIds: string[],
    { fromDate, toDate, groupId }: {
      fromDate?: unknown; toDate?: unknown; groupId?: string | null;
    } = {},
  ) {
    // ID ENDI ODDIY SATR - `new ObjectId(...)` kerak emas (Postgres
    // birlamchi kaliti `VARCHAR(24)`).
    const where: Record<string, unknown> = {
      studentId: { in: studentIds.map(String) },
      isDeleted: false,
    };
    if (groupId) where.groupId = String(groupId);
    if (fromDate && toDate) {
      where.dateKey = {
        gte: dateKeyOf(parseLocalDay(fromDate as string) as Date),
        lte: dateKeyOf(parseLocalDay(toDate as string) as Date),
      };
    }

    // Guruhlash `grades` jadvalining O'Z ustuni (`studentId`) bo'yicha -
    // `groupBy` yetarli, xom SQL kerak emas.
    const rows = await this.prisma.grade.groupBy({
      by: ['studentId'],
      where: where as never,
      _sum: { value: true },
      _count: { _all: true },
    });
    const map = new Map<string, { average: number | null; count: number }>();
    for (const r of rows) {
      const count = r._count._all;
      const sum = r._sum.value || 0;
      map.set(String(r.studentId), {
        average: count ? Math.round((sum / count) * 100) / 100 : null,
        count,
      });
    }
    return map;
  }
}
