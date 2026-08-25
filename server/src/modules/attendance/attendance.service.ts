import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { buildMeta } from '../../common/utils/pagination.js';
import { ROLES } from '../../common/constants/permissions.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { CorrelationCacheService } from '../../common/helpers/correlation-cache.service.js';
import { assertGroupActive } from '../../common/helpers/group-state.js';
import {
  dateKeyOf,
  dayOfWeekOf,
  toUtcMidnight,
  localTodayMidnight,
  localTodayKey,
  parseLocalDay,
} from '../../common/utils/date.js';
import {
  getClassDaysInRange,
  scheduleActiveOn,
  defaultStatusFor,
  withinCourseBounds,
  isHolidayOn,
} from '../../common/utils/attendance.js';
import { HolidaysService } from '../holidays/holidays.service.js';
import { StudentFreezeService } from '../student-freeze/student-freeze.service.js';
import { AttendanceSettingsService } from '../attendance-settings/attendance-settings.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CoinService } from '../coin/coin.service.js';
import { GroupsService } from '../groups/groups.service.js';
import {
  computeClassDays,
  summarizeCells,
  computeRate,
  buildAttBySlot,
  matchAttendanceForCell,
  earliestUnusedSlotDoc,
  lastActiveDayBefore,
  startOfMonth,
  endOfMonth,
  type AttendanceRow,
} from './attendance.internals.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-request.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVOMAT — `modules/attendance/services/attendance.service.js` KO'CHIRMASI.
 *
 * ⚠ JADVAL ALOHIDA JADVALDA (`GroupScheduleItem`). Mongo'da `schedule`
 * guruh hujjati ichidagi massiv edi va `Group.findOne` bilan O'ZI
 * kelardi. `include` qilinmasa `undefined` bo'lib qoladi va
 * `scheduleActiveOn()` bo'sh massiv qaytaradi: HAR KUN "dars kuni emas"
 * bo'lib, davomat UMUMAN belgilanmasdi. Shuning uchun `GROUP_SELECT`
 * yagona manba.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const STUDENT_SELECT = {
  // ⚠ `id` ATAYLAB: Prisma `select` bilan avtomatik KELMAYDI (Mongo
  // `_id` ni doim qaytarardi), klient esa o'quvchini `_id` bo'yicha
  // ochadi.
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
} as const;

const GROUP_SELECT = {
  id: true,
  name: true,
  branchId: true,
  courseId: true,
  startDate: true,
  endDate: true,
  isActive: true,
  isDeleted: true,
  teachers: { select: { id: true } },
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_STATUSES = ['present', 'absent', 'excused', 'exempt'];

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger('Attendance');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly holidays: HolidaysService,
    private readonly freezes: StudentFreezeService,
    private readonly settings: AttendanceSettingsService,
    private readonly notifications: NotificationsService,
    private readonly coins: CoinService,
    private readonly groups: GroupsService,
    private readonly correlation: CorrelationCacheService,
  ) {}

  /**
   * FILIAL KO'LAMI shu YAGONA nuqtada.
   *
   * Butun fayl bo'ylab ishlatiladi (`listForGroupOnDate`, `bulkRecord`,
   * `getGroupMonthly`, `getGroupSummary`...). Filtrni shu yerga qo'yish
   * o'nlab chaqiruvni birdan yopadi — har birida alohida eslab
   * qolishdan ancha ishonchli.
   *
   * ⚠ Boshqa filial guruhi so'ralsa 404 (403 EMAS): mavjudligini ham
   * oshkor qilmaymiz.
   */
  private async ensureGroup(groupId: string) {
    const g = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      select: GROUP_SELECT,
    });
    if (!g) throw new ApiError(404, 'Guruh topilmadi');
    return g;
  }

  // ═════════════════════ BITTA GURUH + SANA (+ sessiya) ═════════════════════

  async listForGroupOnDate(
    groupId: string,
    dateInput: unknown,
    slotInput: string | null = null,
  ) {
    const group = await this.ensureGroup(groupId);
    const date = parseLocalDay(dateInput);
    if (!date) throw new ApiError(400, "Sana noto'g'ri");
    const dow = dayOfWeekOf(date);
    // Shu sanada AMAL QILGAN jadval versiyasi (versiyalash).
    const daySlots = scheduleActiveOn(group.schedule, date)
      .filter((s) => s.day === dow)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));

    // Kunning sessiyalari: bir slotli kun → slot=""; ko'p slotli →
    // slot=startTime.
    const multi = daySlots.length > 1;
    const sessions = daySlots.map((s) => ({
      slot: multi ? s.startTime : '',
      startTime: s.startTime,
      endTime: s.endTime,
    }));
    const selectedSlot =
      slotInput !== null && slotInput !== undefined
        ? slotInput
        : sessions[0]?.slot ?? '';

    const holidaySet = await this.holidays.holidayKeySetForRange(date, date);
    const isHoliday = isHolidayOn(holidaySet, date);
    const isClassDay =
      daySlots.length > 0 && withinCourseBounds(group, date) && !isHoliday;

    // ⚠ Shu sanada faol a'zoliklar. `joinedAt` KUN ICHIDA bo'lsa ham
    // qamrab olish uchun KUN OXIRI bilan solishtiriladi.
    const dayEnd = new Date(date.getTime() + DAY_MS);
    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        groupId: String(groupId),
        joinedAt: { lt: dayEnd },
        OR: [{ leftAt: null }, { leftAt: { gt: date } }],
        isDeleted: false,
      },
      select: { studentId: true, student: { select: STUDENT_SELECT } },
    });

    const studentIds = memberships.filter((m) => m.student).map((m) => m.student!.id);

    const dKey = dateKeyOf(date)!;
    const [attendances, exemptions] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          groupId: String(groupId),
          studentId: { in: studentIds },
          dateKey: dKey,
          slot: selectedSlot,
          isDeleted: false,
        },
      }),
      this.freezes.loadExemptionsWithFreezes(studentIds),
    ]);

    const attMap = new Map<string, unknown>();
    for (const a of attendances) attMap.set(String(a.studentId), a);
    const exempMap = new Map<string, Record<string, any>[]>();
    for (const ex of exemptions) {
      const key = String(ex.studentId ?? ex.student);
      if (!exempMap.has(key)) exempMap.set(key, []);
      exempMap.get(key)!.push(ex);
    }

    const rows = memberships
      .filter((m) => m.student)
      .map((m) => {
        const sid = String(m.student!.id);
        const attendance = attMap.get(sid) || null;
        const studentExemptions = exempMap.get(sid) || [];
        const def = defaultStatusFor(studentExemptions as never, date, dow);
        // `toJSON()` EMAS — Prisma oddiy obyekt qaytaradi. Javobda `_id`
        // QOLADI: klient qatorni shu bo'yicha ajratadi.
        return {
          student: withLegacyId(m.student),
          attendance: attendance ? withLegacyId(attendance) : null,
          defaultStatus: def,
        };
      });

    return {
      group: { _id: group.id, name: group.name, schedule: group.schedule },
      date,
      dateKey: dKey,
      isClassDay,
      isHoliday,
      slots: daySlots, // orqaga-moslik
      sessions, // [{ slot, startTime, endTime }]
      slot: selectedSlot,
      rows,
    };
  }

  // ═══════════════════════════ OMMAVIY YOZISH ═══════════════════════════

  private validateItem(item: { studentId?: string; status?: string }) {
    if (!item.studentId) throw new ApiError(400, "O'quvchi kerak");
    if (!VALID_STATUSES.includes(item.status as string)) {
      throw new ApiError(400, "Holat noto'g'ri");
    }
    // Sababli uchun sabab IXTIYORIY — status tanlanishi yetarli.
  }

  /**
   * ⚠ TRANZAKSIYA — ENDI HAQIQIY.
   *
   * Mongo'da `startSession()` standalone o'rnatmada JIMGINA atomiklikni
   * yo'qotardi (tranzaksiya replica set talab qiladi). PostgreSQL'da
   * `$transaction` har doim haqiqiy: legacy slot ko'chirish + upsert'lar
   * yo HAMMASI bajariladi, yo HECH BIRI — yarim belgilangan davomat
   * varag'i qolmaydi.
   *
   * ⚠ VAQT CHEGARASI 20s: bitta guruhda 30+ o'quvchi bo'lishi mumkin va
   * har biri alohida find-then-write — standart 5 soniya yetmasdi.
   */
  private runInTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 20000 });
  }

  async bulkRecord(
    groupId: string,
    dateInput: string,
    items: { studentId: string; status: string; reason?: string; lateMinutes?: number }[],
    currentUser: AuthenticatedUser,
    source = 'teacher',
    slot = '',
  ) {
    const group = await this.ensureGroup(groupId);
    // Arxivlangan guruhda davomat belgilanmaydi.
    assertGroupActive(group);

    // ⚠ TEACHER bo'lsa `group.teachers` ichida bo'lishi SHART.
    // Mongo'da `teachers` ObjectId MASSIVI edi; Prisma'da `{ id }`
    // obyektlari. `String(t)` obyektga qo'llanganda "[object Object]"
    // berib, HAR DOIM `false` chiqarardi — o'qituvchi O'Z guruhiga ham
    // kira olmasdi.
    if (currentUser.role === ROLES.TEACHER) {
      const isOwn = (group.teachers || []).some(
        (t: any) => String(t.id ?? t) === String(currentUser._id),
      );
      if (!isOwn) throw new ApiError(403, 'Bu guruh sizga biriktirilmagan');
    }

    const date = parseLocalDay(dateInput);
    if (!date) throw new ApiError(400, "Sana noto'g'ri");
    const dKey = dateKeyOf(date)!;

    // ⚠ KELAJAK SANA TAQIQLANADI (o'tmishni tuzatish mumkin). "Bugun"
    // MAHALLIY (Asia/Tashkent) kalendar kuni bo'yicha — yarim tundan
    // keyin ham bugungi davomat belgilanishi uchun.
    if (date.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "Kelajak kun uchun davomat belgilab bo'lmaydi");
    }

    // A-5: kurs chegaralaridan tashqarida davomat YOZILMAYDI. O'qish
    // qatlami bu kunlarni baribir e'tiborsiz qoldiradi — yozmaslik
    // ma'lumotni toza tutadi.
    if (!withinCourseBounds(group, date)) {
      throw new ApiError(
        400,
        "Bu sana guruh kurs muddatidan tashqarida (boshlanishidan oldin yoki yakunlangach)",
      );
    }

    const dow = dayOfWeekOf(date);
    const daySlots = scheduleActiveOn(group.schedule, date).filter(
      (s) => s.day === dow,
    );
    if (daySlots.length === 0) {
      throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
    }
    // Sessiya tekshiruvi: bir slotli kun → ""; ko'p slotli → mavjud startTime.
    const normalizedSlot = daySlots.length > 1 ? slot || '' : '';
    if (
      daySlots.length > 1 &&
      !daySlots.some((s) => s.startTime === normalizedSlot)
    ) {
      throw new ApiError(400, "Sessiya (dars vaqti) noto'g'ri");
    }

    /**
     * ⚠ BUG-03 (double-count) HIMOYASI.
     *
     * Jadval 1→ko'p slotga o'zgargan bo'lsa, eski yozuvlar `slot=""`
     * bilan qolgan. Ko'p slotli kunning BIRINCHI sloti uchun ularni
     * yangi slotga KO'CHIRISH kerak — aks holda `slot=""` yozuv "yetim"
     * qolib, alohida (phantom) yozuv paydo bo'lardi.
     *
     * ⚠ KO'CHIRISH BARCHA VALIDATSIYALARDAN KEYIN VA TRANZAKSIYA
     * ICHIDA bajariladi (pastda) — aks holda so'rov rad etilsa ham
     * yozuv ko'chib qolardi (atomiklik defekti).
     */
    const isFirstSlotOfDay =
      daySlots.length > 1 &&
      normalizedSlot ===
        daySlots.map((s) => s.startTime).sort((a, b) => a.localeCompare(b))[0];

    // Bayram/dam olish kuni — davomat belgilanmaydi (foizga ham
    // ta'sir qilmaydi).
    const holidaySet = await this.holidays.holidayKeySetForRange(date, date);
    if (isHolidayOn(holidaySet, date)) {
      throw new ApiError(400, "Bu kun bayram/dam olish kuni - davomat belgilanmaydi");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, "Hech bo'lmaganda bitta yozuv kerak");
    }
    for (const item of items) this.validateItem(item);

    const studentIds = items.map((it) => it.studentId);
    // ⚠ TAKRORIY `studentId` RAD ETILADI: `existingMap` sikldan OLDIN
    // bir marta olinadi va sikl ichida yangilanmaydi, shuning uchun
    // takror yuborilgan o'quvchi audit `history.from` ini buzib, bitta
    // o'zgarish uchun IKKITA yozuv qo'shardi.
    if (new Set(studentIds.map(String)).size !== studentIds.length) {
      throw new ApiError(400, "Bir o'quvchi bir necha marta yuborildi");
    }

    const dayEnd = new Date(date.getTime() + DAY_MS);
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

    // `existingMap` tranzaksiya ichida to'ldiriladi (legacy slot
    // ko'chirishdan KEYIN), lekin tranzaksiyadan keyin
    // `notifyConsecutiveAbsences` ham ishlatadi — tashqi scope'da.
    const existingMap = new Map<string, any>();

    const results = await this.runInTransaction(async (tx) => {
      if (isFirstSlotOfDay) {
        await tx.attendance.updateMany({
          where: {
            groupId: String(groupId),
            studentId: { in: studentIds.map(String) },
            dateKey: dKey,
            slot: '',
            isDeleted: false,
          },
          data: { slot: normalizedSlot },
        });
      }

      // Audit: mavjud yozuvlarni KO'CHIRISHDAN KEYIN olamiz — holat
      // o'zgarsa tarixga yozish va ko'chirilgan yozuvni ko'rish uchun.
      existingMap.clear();
      const existing = await tx.attendance.findMany({
        where: {
          groupId: String(groupId),
          studentId: { in: studentIds.map(String) },
          dateKey: dKey,
          slot: normalizedSlot,
          isDeleted: false,
        },
      });
      for (const a of existing) existingMap.set(String(a.studentId), a);

      /**
       * ⚠ QISMAN UNIQUE INDEKS: `(groupId, studentId, dateKey, slot)`
       * FAQAT `WHERE isDeleted = false` uchun amal qiladi. Prisma
       * `upsert` bunday indeksni ISHLATA OLMAYDI (u to'liq unique
       * kalit talab qiladi) — shuning uchun find-then-write va P2002
       * da qayta urinish.
       */
      const docs: unknown[] = [];
      for (const item of items) {
        const prev = existingMap.get(String(item.studentId));
        const changed = !prev || prev.status !== item.status;

        // `$push` o'rni: `history` ustuni `Json`, massiv JS'da yig'iladi.
        const history = Array.isArray(prev?.history) ? [...prev.history] : [];
        if (changed) {
          history.push({
            at: new Date(),
            by: String(currentUser._id),
            from: prev ? prev.status : null,
            to: item.status,
            source,
          });
        }

        const data = {
          status: item.status,
          reason: item.reason || '',
          lateMinutes: item.lateMinutes || 0,
          recordedById: currentUser._id ? String(currentUser._id) : null,
          recordedAt: new Date(),
          source,
          isDeleted: false, // qayta belgilansa soft-delete BEKOR qilinadi
          history,
        };

        let doc: unknown = null;
        if (prev) {
          doc = await tx.attendance.update({ where: { id: prev.id }, data });
        } else {
          try {
            doc = await tx.attendance.create({
              data: {
                groupId: String(groupId),
                studentId: String(item.studentId),
                date,
                dateKey: dKey,
                slot: normalizedSlot,
                ...data,
              },
            });
          } catch (err: any) {
            // Bir vaqtda birinchi marta saqlanganda unique-index
            // poygasi: yozuv endi mavjud — ustiga yozamiz.
            // Mongo'da `11000`, Prisma'da `P2002`.
            if (err?.code !== 'P2002') throw err;
            const again = await tx.attendance.findFirst({
              where: {
                groupId: String(groupId),
                studentId: String(item.studentId),
                dateKey: dKey,
                slot: normalizedSlot,
                isDeleted: false,
              },
            });
            doc = again
              ? await tx.attendance.update({ where: { id: again.id }, data })
              : null;
          }
        }
        if (doc) docs.push(doc);
      }
      return docs;
    });

    // Davomat o'zgardi → korrelatsiya keshini SHU OY uchun bekor qilamiz.
    void this.correlation.invalidate(date.getUTCFullYear(), date.getUTCMonth() + 1);

    // Ketma-ket qoldirish ogohlantirishi — BLOKLAMAYDI.
    this.notifyConsecutiveAbsences({ group, items, existingMap, dateKey: dKey }).catch(
      (err) => this.logger.warn(`Ketma-ket qoldirish ogohlantirishi yuborilmadi: ${err}`),
    );

    // ── TANGA (rag'bat) — BLOKLAMAYDI ──
    //
    // ⚠ `await` ATAYLAB YO'Q va xato YUTILADI. Davomat — PUL YO'LIDA
    // turgan yozuv (maosh, to'lov va hisobot shunga tayanadi); tanga
    // esa rag'bat. Tanga hisoblanmagani uchun DARS JURNALI saqlanmay
    // qolishi mumkin emas.
    //
    // Idempotentlik `CoinService` ichida: kalit davomat yozuvining
    // ID'siga bog'langan (`attendance:<id>`), ya'ni holat qayta
    // belgilanganda ikkinchi marta to'lanmaydi. Aynan shuning uchun
    // bu yerda "o'zgardimi" degan tekshiruv YO'Q — u ikkinchi,
    // ajralib ketadigan haqiqat manbai bo'lardi.
    void this.coins
      .awardForAttendance(results as never, group.branchId ?? null)
      .catch((err) => this.logger.warn(`Tanga hisoblanmadi: ${err}`));

    return results;
  }

  /**
   * Ketma-ket qoldirish chegarasiga YANGI yetgan o'quvchilar uchun
   * egasi va o'qituvchilarga ogohlantirish.
   *
   * ⚠ CHEGARAGA AYNAN TENG bo'lganda BIR MARTA ishlaydi (`===`, `>=`
   * emas) — aks holda har keyingi qoldirishda qayta yuborilardi.
   */
  private async notifyConsecutiveAbsences({
    group,
    items,
    existingMap,
    dateKey,
  }: {
    group: any;
    items: { studentId: string; status: string }[];
    existingMap: Map<string, any>;
    dateKey: string;
  }) {
    /**
     * ═══════════════════════════════════════════════════════════════
     * ⚠⚠ ATAYLAB O'CHIRILGAN — EXPRESS'DA BU KOD HECH QACHON
     *     ISHLAMAYDI (ISBOTLANGAN XATO).
     * ═══════════════════════════════════════════════════════════════
     *
     * Express `consecutiveAbsences()` Prisma'ga MONGO filtrini
     * uzatadi:
     *
     *     { student: id, isDeleted: { $ne: true },
     *       dateKey: { $lte: localTodayKey() } }
     *
     * Prisma bunday argumentni qabul qilmaydi va HAR CHAQIRUVDA
     * `PrismaClientValidationError` tashlaydi ("Argument `student`:
     * Invalid value provided"). Xato esa yuqorida `.catch()` bilan
     * yutiladi va faqat `warn` ga tushadi.
     *
     * NATIJA: ogohlantirish Express'da HECH QACHON YUBORILMAYDI —
     * `consecutiveAbsencesAlert = 3` bo'lsa ham. Bu tekshirib
     * ko'rildi (ikkala shox ham yiqiladi).
     *
     * ── NEGA NestJS'DA HAM YUBORILMAYDI ──
     *
     * Pastdagi `consecutiveAbsences()` NestJS'da TO'G'RI yozilgan
     * (bila turib buzuq kod ko'chirilmaydi). Ya'ni bu yerda erta
     * qaytish OLIB TASHLANSA, ogohlantirish DARHOL ishlay boshlardi
     * va ko'chirish paytida egalarga kutilmagan xabarlar oqimi
     * ketardi — hech kim so'ramagan, KO'RINADIGAN o'zgarish.
     * Bu "jimgina xatti-harakat o'zgarishi" ta'rifiga aynan tushadi.
     *
     * ── ✅ B16 YOQILDI (2026-08-22, EGA QARORI) ──
     *
     * Erta qaytish (`EXPRESS_NOTIFICATION_IS_DEAD`) OLIB TASHLANDI.
     * Sabab: Express endi O'LIK, ya'ni "ikkala stek bir vaqtda
     * yoqilsin" sharti o'z-o'zidan bajarildi — yoqiladigan ikkinchi
     * stek yo'q. Ogohlantirishni yuborish endi FAQAT shu kodga
     * bog'liq va u to'g'ri yozilgan.
     *
     * ⚠ BU KO'RINADIGAN O'ZGARISH. `consecutiveAbsencesAlert = 3`
     * (o'lchandi), ya'ni o'quvchi ketma-ket 3 marta kelmasa
     * egalarga HAQIQIY xabar ketadi. Bu ega tomonidan ATAYLAB
     * so'ralgan.
     *
     * ⚠ `test/attendance-parity.test.mjs` (tarixiy, endi
     * yurgizilmaydi — ikkinchi stek yo'q) TESKARI holatni qulflagan
     * edi: "`bulkRecord` dan keyin `notifications` O'SMASIN". O'sha
     * tekshiruv endi NOTO'G'RI. Uning o'rniga
     * `test/consecutive-absence-alert.test.mjs` YANGI invariantni
     * qulflaydi: ostona kesilganda xabar YARATILISHI SHART.
     */
    const settings = await this.settings.get();
    const threshold = (settings as any).consecutiveAbsencesAlert || 0;
    if (threshold < 1) return;

    // Faqat YANGI yoki absent'ga o'zgartirilgan yozuvlar.
    const candidates = items.filter((it) => {
      if (it.status !== 'absent') return false;
      const prev = existingMap.get(String(it.studentId));
      return !prev || prev.status !== 'absent';
    });
    if (candidates.length === 0) return;

    const crossed: string[] = [];
    for (const it of candidates) {
      // Faqat SHU guruh bo'yicha ketma-ket qoldirish.
      const count = await this.consecutiveAbsences(it.studentId, group.id);
      if (count === threshold) crossed.push(it.studentId);
    }
    if (crossed.length === 0) return;

    const [students, owners] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: crossed.map(String) } },
        select: STUDENT_SELECT,
      }),
      this.prisma.user.findMany({
        where: { role: ROLES.OWNER, isActive: true, isDeleted: false },
        select: { id: true },
      }),
    ]);

    const recipientSet = new Set(owners.map((o) => String(o.id)));
    for (const t of group.teachers || []) recipientSet.add(String(t.id ?? t));
    const userIds = [...recipientSet];
    if (userIds.length === 0) return;

    for (const stu of students) {
      const name = `${stu.lastName || ''} ${stu.firstName || ''}`.trim();
      await this.notifications.send(
        {
          title: 'Davomat ogohlantirishi',
          body: `${name} ketma-ket ${threshold} marta darsga kelmadi.\nGuruh: ${group.name}`,
          category: 'attendance',
          audience: { type: 'auto_system', userIds },
          isAuto: true,
          // Bir o'quvchi-guruh-kun bo'yicha BIR MARTA (qayta
          // belgilashda dublikat bo'lmasin).
          dedupeKey: `consec:${String(stu.id)}:${String(group.id)}:${dateKey}`,
        },
        null,
      );
    }
  }

  // ═══════════════════════ O'QUVCHI: OYLIK / YILLIK ═══════════════════════

  /**
   * ⚠ `scopeGroupIds` BERILSA (o'qituvchi so'rovi) — FAQAT shu guruhlar.
   * Aks holda o'qituvchi o'zi O'QITMAYDIGAN guruhlardagi davomatni ham
   * ko'rib qolardi (A-1 cross-group disclosure).
   */
  private async buildStudentClassDays(
    studentId: string,
    rangeStart: Date,
    rangeEnd: Date,
    scopeGroupIds: string[] | null = null,
  ) {
    const membershipFilter: Record<string, unknown> = {
      studentId: String(studentId),
      joinedAt: { lte: rangeEnd },
      OR: [{ leftAt: null }, { leftAt: { gte: rangeStart } }],
      isDeleted: false,
    };
    // `group` → `groupId`: Prisma'da `group` RELATION.
    if (scopeGroupIds) membershipFilter.groupId = { in: scopeGroupIds.map(String) };

    const memberships = await this.prisma.groupMembership.findMany({
      where: membershipFilter,
      select: { joinedAt: true, leftAt: true, group: { select: GROUP_SELECT } },
    });

    const [exemptions, holidaySet] = await Promise.all([
      this.freezes.loadExemptionsWithFreezes(studentId),
      this.holidays.holidayKeySetForRange(rangeStart, rangeEnd),
    ]);

    const groups: any[] = [];
    const dKeys = new Set<string>();

    for (const m of memberships) {
      if (!m.group) continue;
      const effFrom = m.joinedAt > rangeStart ? toUtcMidnight(m.joinedAt) : rangeStart;
      // `leftAt` EXCLUSIVE — oxirgi faol kun `leftAt` dan oldingi kun.
      const leftBound = m.leftAt ? lastActiveDayBefore(m.leftAt) : null;
      let effTo = leftBound && leftBound < rangeEnd ? leftBound : rangeEnd;
      if (m.group.endDate) {
        const fin = toUtcMidnight(m.group.endDate);
        if (fin < effTo) effTo = fin;
      }

      const classDays = getClassDaysInRange(m.group, effFrom, effTo, holidaySet);
      const days = classDays.map((cd) => {
        const def = defaultStatusFor(exemptions as never, cd.date, cd.dayOfWeek);
        dKeys.add(cd.dateKey as string);
        return {
          date: cd.date,
          dateKey: cd.dateKey,
          dayOfWeek: cd.dayOfWeek,
          slot: cd.slot || '',
          isFirstSlot: cd.isFirstSlot,
          startTime: cd.startTime,
          endTime: cd.endTime,
          defaultStatus: def,
          attendance: null as unknown,
        };
      });

      groups.push({
        group: { _id: m.group.id, name: m.group.name, schedule: m.group.schedule },
        days,
      });
    }

    const attendances = await this.prisma.attendance.findMany({
      where: {
        studentId: String(studentId),
        dateKey: { in: Array.from(dKeys) },
        isDeleted: false,
      },
    });
    const byDay = buildAttBySlot(attendances as unknown as AttendanceRow[]);

    for (const g of groups) {
      const used = new Set<AttendanceRow>();
      for (const d of g.days) {
        const att = matchAttendanceForCell(
          byDay,
          {
            groupId: g.group._id,
            dateKey: d.dateKey,
            slot: d.slot,
            isFirstSlot: d.isFirstSlot,
          },
          used,
        );
        d.attendance = att ? withLegacyId(att) : null;
      }
    }

    return groups;
  }

  async getStudentMonthly(
    studentId: string,
    { year, month, scopeGroupIds = null }: {
      year: number; month: number; scopeGroupIds?: string[] | null;
    },
  ) {
    const groups = await this.buildStudentClassDays(
      studentId,
      startOfMonth(year, month),
      endOfMonth(year, month),
      scopeGroupIds,
    );
    return { studentId, year, month, groups };
  }

  async getStudentYear(
    studentId: string,
    { year, scopeGroupIds = null }: { year: number; scopeGroupIds?: string[] | null },
  ) {
    const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const groups = await this.buildStudentClassDays(
      studentId, yearStart, yearEnd, scopeGroupIds,
    );
    return { studentId, year, groups };
  }

  // ═══════════════════ GURUH BO'YICHA OYLIK MATRITSA ═══════════════════

  async getGroupMonthly(groupId: string, { year, month }: { year: number; month: number }) {
    const group = await this.ensureGroup(groupId);
    const monthStart = startOfMonth(year, month);
    const monthEnd = endOfMonth(year, month);

    const holidaySet = await this.holidays.holidayKeySetForRange(monthStart, monthEnd);

    // Har ustun BITTA SESSIYA: kunda bir nechta dars bo'lsa — bir nechta
    // ustun. `colKey` — kataklar kaliti (bir slotli/no-class kunda
    // `dateKey`; ko'p slotli kunda `dateKey__HH:mm`).
    const dates: any[] = [];
    const dateKeys = new Set<string>();
    const cur = new Date(monthStart);
    while (cur.getTime() <= monthEnd.getTime()) {
      const dow = dayOfWeekOf(cur);
      const dKey = dateKeyOf(cur)!;
      dateKeys.add(dKey);
      const daySlots = scheduleActiveOn(group.schedule, cur)
        .filter((s) => s.day === dow)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
      const inBounds = withinCourseBounds(group, cur) && !holidaySet.has(dKey);
      const isClassDay = daySlots.length > 0 && inBounds;
      if (isClassDay && daySlots.length > 1) {
        daySlots.forEach((s, idx) => {
          dates.push({
            date: new Date(cur), dateKey: dKey,
            colKey: `${dKey}__${s.startTime}`,
            slot: s.startTime, startTime: s.startTime, dayOfWeek: dow,
            isClassDay: true, isFirstSlot: idx === 0,
            isHoliday: holidaySet.has(dKey),
          });
        });
      } else {
        dates.push({
          date: new Date(cur), dateKey: dKey, colKey: dKey, slot: '',
          startTime: daySlots[0]?.startTime || null, dayOfWeek: dow,
          isClassDay, isFirstSlot: true, isHoliday: holidaySet.has(dKey),
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        groupId: String(groupId),
        joinedAt: { lte: monthEnd },
        OR: [{ leftAt: null }, { leftAt: { gte: monthStart } }],
        isDeleted: false,
      },
      select: {
        joinedAt: true, leftAt: true, studentId: true,
        student: { select: STUDENT_SELECT },
      },
    });

    const activeMemberships = memberships.filter((m) => m.student);
    const studentIds = activeMemberships.map((m) => m.student!.id);

    const [attendances, exemptions] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          groupId: String(groupId),
          studentId: { in: studentIds },
          dateKey: { in: Array.from(dateKeys) },
          isDeleted: false,
        },
      }),
      this.freezes.loadExemptionsWithFreezes(studentIds),
    ]);

    const attByStudentDay = new Map<string, Map<string, any>>();
    for (const a of attendances) {
      // ⚠ `a.student` EMAS, `a.studentId` — `buildAttBySlot` bilan bir
      // xil tuzoq.
      const k = `${String(a.studentId)}|${a.dateKey}`;
      if (!attByStudentDay.has(k)) attByStudentDay.set(k, new Map());
      attByStudentDay.get(k)!.set(a.slot || '', a);
    }
    const exempMap = new Map<string, any[]>();
    for (const ex of exemptions) {
      // ⚠ Express bu yerda `ex.student` ni o'qiydi (boshqa joylarda
      // `ex.studentId ?? ex.student`). Ikkalasi ham to'ldirilgani
      // uchun natija bir xil — lekin farq ATAYLAB saqlangan.
      const key = String(ex.student);
      if (!exempMap.has(key)) exempMap.set(key, []);
      exempMap.get(key)!.push(ex);
    }

    /**
     * ⚠ BIR O'QUVCHINING BIR OY ICHIDA BIR NECHTA A'ZOLIGI bo'lishi
     * mumkin (chiqarilib, keyin qayta qabul qilingan). Ularni BITTA
     * qatorga birlashtiramiz — aks holda o'quvchi davomat jadvalida
     * IKKI MARTA ko'rinardi.
     */
    const byStudent = new Map<string, { student: any; intervals: any[] }>();
    for (const m of activeMemberships) {
      const sid = String(m.student!.id);
      if (!byStudent.has(sid)) byStudent.set(sid, { student: m.student, intervals: [] });
      byStudent.get(sid)!.intervals.push({
        joinedTs: toUtcMidnight(m.joinedAt).getTime(),
        leftTs: m.leftAt ? toUtcMidnight(m.leftAt).getTime() : null,
      });
    }

    const students = Array.from(byStudent.values()).map(({ student, intervals }) => {
      const sid = String(student.id);
      const stuExemptions = exempMap.get(sid) || [];
      // ⚠ `leftTs` EXCLUSIVE (`ts < leftTs`): chiqilgan kun yarim tuni
      // ARTIQ a'zolik emas — belgilash yo'li (`leftAt > date`) va
      // `computeClassDays` bilan bir xil chegara.
      const isMemberOn = (ts: number) =>
        intervals.some(
          (iv) => ts >= iv.joinedTs && (iv.leftTs === null || ts < iv.leftTs),
        );

      const dayMap = attByStudentDay;
      const usedAtt = new Set<any>(); // bir yozuv faqat bir katak uchun
      const cells: Record<string, unknown> = {};
      for (const d of dates) {
        const ts = d.date.getTime();
        const key = d.colKey;
        if (!d.isClassDay) { cells[key] = null; continue; }
        if (!isMemberOn(ts)) { cells[key] = null; continue; }
        const slots = dayMap.get(`${sid}|${d.dateKey}`);
        const want = d.slot || '';
        let att = slots ? slots.get(want) : undefined;
        // Jadval keyinroq o'zgargan bo'lsa eski yozuvni shu kunning
        // katagiga bog'laymiz (IKKI YO'NALISHLI — yo'qolmasin va ikki
        // marta sanalmasin).
        if (!att && d.isFirstSlot && slots) {
          if (want !== '') {
            const legacy = slots.get('');
            if (legacy && !usedAtt.has(legacy)) att = legacy;
          } else {
            att = earliestUnusedSlotDoc(slots as never, usedAtt as never) || undefined;
          }
        }
        if (att) {
          if (usedAtt.has(att)) att = undefined;
          else usedAtt.add(att);
        }
        const def = defaultStatusFor(stuExemptions as never, d.date, d.dayOfWeek);
        cells[key] = att
          ? {
              status: att.status,
              defaultStatus: def,
              reason: att.reason || '',
              lateMinutes: att.lateMinutes || 0,
            }
          : { status: null, defaultStatus: def, reason: '', lateMinutes: 0 };
      }

      return { student: withLegacyId(student), cells };
    });

    students.sort((a: any, b: any) => {
      const lnA = (a.student.lastName || '').toLowerCase();
      const lnB = (b.student.lastName || '').toLowerCase();
      if (lnA !== lnB) return lnA < lnB ? -1 : 1;
      const fnA = (a.student.firstName || '').toLowerCase();
      const fnB = (b.student.firstName || '').toLowerCase();
      if (fnA === fnB) return 0;
      return fnA < fnB ? -1 : 1;
    });

    return {
      // ⚠⚠ `group._id` ATAYLAB — VA U `undefined`. Express AYNAN
      // shunday yozadi, Prisma qatorida esa `_id` YO'Q (faqat `id`).
      // Natijada `JSON.stringify` bu kalitni butunlay TASHLAB
      // KETADI va javobda `group: { name, schedule }` qoladi.
      // Bu XATO (klient guruh ID'sini bu yerdan ola olmaydi), lekin
      // KLIENT SHARTNOMASI — `MIGRATION-CHECKLIST.md` da hujjatlangan.
      // `group.id` ga o'zgartirilsa javobga YANGI kalit qo'shilardi.
      group: { _id: (group as any)._id, name: group.name, schedule: group.schedule },
      year,
      month,
      dates,
      students,
    };
  }

  // ═══════════════════════ HISOBOTLAR ═══════════════════════

  async getStudentSummary(
    studentId: string,
    { fromDate, toDate, scopeGroupIds = null }: {
      fromDate?: unknown; toDate?: unknown; scopeGroupIds?: string[] | null;
    } = {},
  ) {
    if (!fromDate || !toDate) {
      return summarizeCells({ total: 0, cells: [], attendances: [] });
    }
    const from = parseLocalDay(fromDate)!;
    const to = parseLocalDay(toDate)!;

    const membershipFilter: Record<string, unknown> = {
      studentId: String(studentId),
      joinedAt: { lte: to },
      OR: [{ leftAt: null }, { leftAt: { gte: from } }],
      isDeleted: false,
    };
    if (scopeGroupIds) membershipFilter.groupId = { in: scopeGroupIds.map(String) };

    const [memberships, exemptions, holidaySet] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: membershipFilter,
        select: { joinedAt: true, leftAt: true, group: { select: GROUP_SELECT } },
      }),
      this.freezes.loadExemptionsWithFreezes(studentId),
      this.holidays.holidayKeySetForRange(from, to),
    ]);

    const { total, cells } = computeClassDays({
      memberships: memberships as never,
      exemptions: exemptions as never,
      from, to, holidaySet,
    });

    if (total === 0) {
      return summarizeCells({ total: 0, cells: [], attendances: [] });
    }

    const dKeys = Array.from(new Set(cells.map((c) => c.dateKey)));
    const attendances = await this.prisma.attendance.findMany({
      where: {
        studentId: String(studentId),
        dateKey: { in: dKeys },
        isDeleted: false,
      },
    });

    return summarizeCells({ total, cells, attendances: attendances as never });
  }

  async getGroupSummary(
    groupId: string,
    { fromDate, toDate }: { fromDate?: unknown; toDate?: unknown },
  ) {
    const group = await this.ensureGroup(groupId);
    const from = parseLocalDay(fromDate)!;
    const to = parseLocalDay(toDate)!;

    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        groupId: String(groupId),
        joinedAt: { lte: to },
        OR: [{ leftAt: null }, { leftAt: { gte: from } }],
        isDeleted: false,
      },
      select: {
        joinedAt: true, leftAt: true, studentId: true,
        student: { select: STUDENT_SELECT },
      },
    });

    const studentIds = memberships.filter((m) => m.student).map((m) => m.student!.id);
    const [exemptions, holidaySet] = await Promise.all([
      this.freezes.loadExemptionsWithFreezes(studentIds),
      this.holidays.holidayKeySetForRange(from, to),
    ]);
    const exempByStudent = new Map<string, any[]>();
    for (const ex of exemptions) {
      const k = String(ex.studentId ?? ex.student);
      if (!exempByStudent.has(k)) exempByStudent.set(k, []);
      exempByStudent.get(k)!.push(ex);
    }

    // ⚠ Bir o'quvchining bir nechta a'zoligini BITTA o'quvchi sifatida
    // birlashtiramiz — aks holda hisobotda dublikat qator chiqib,
    // davomat IKKI MARTA sanalardi.
    const membershipsByStudent = new Map<string, { student: any; intervals: any[] }>();
    for (const m of memberships) {
      if (!m.student) continue;
      const sid = String(m.student.id);
      if (!membershipsByStudent.has(sid)) {
        membershipsByStudent.set(sid, { student: m.student, intervals: [] });
      }
      membershipsByStudent.get(sid)!.intervals.push({
        joinedAt: m.joinedAt, leftAt: m.leftAt, group,
      });
    }

    const perStudentCells = new Map<string, { total: number; cells: any[] }>();
    const allDKeys = new Set<string>();
    for (const [sid, { intervals }] of membershipsByStudent) {
      const { total, cells } = computeClassDays({
        memberships: intervals as never,
        exemptions: (exempByStudent.get(sid) || []) as never,
        from, to, holidaySet,
      });
      perStudentCells.set(sid, { total, cells });
      for (const c of cells) allDKeys.add(c.dateKey);
    }

    // Barcha o'quvchilarning yozuvlarini BITTA so'rovda (N+1 YO'Q).
    const allAttendances = await this.prisma.attendance.findMany({
      where: {
        groupId: String(groupId),
        studentId: { in: studentIds.map(String) },
        dateKey: { in: Array.from(allDKeys) },
        isDeleted: false,
      },
    });
    const attByStudent = new Map<string, any[]>();
    for (const a of allAttendances) {
      const k = String(a.studentId);
      if (!attByStudent.has(k)) attByStudent.set(k, []);
      attByStudent.get(k)!.push(a);
    }

    const perStudent: any[] = [];
    const aggregate: Record<string, number> = {
      present: 0, absent: 0, excused: 0, late: 0, exempt: 0,
      unmarked: 0, totalClasses: 0,
    };

    for (const [sid, { student }] of membershipsByStudent) {
      const { total, cells } = perStudentCells.get(sid) || { total: 0, cells: [] };
      const summary = summarizeCells({
        total, cells, attendances: (attByStudent.get(sid) || []) as never,
      });
      perStudent.push({ student: withLegacyId(student), summary });
      aggregate.present += summary.present as number;
      aggregate.absent += summary.absent as number;
      aggregate.excused += summary.excused as number;
      aggregate.late += summary.late as number;
      aggregate.exempt += summary.exempt as number;
      aggregate.unmarked += (summary.unmarked as number) || 0;
      aggregate.totalClasses += summary.totalClasses as number;
    }

    const groupRate = computeRate(aggregate as never);

    return {
      // ⚠ `group._id` — `getGroupMonthly` dagi bilan AYNI holat:
      // `undefined` va javobdan tushib qoladi. Ataylab saqlangan.
      group: { _id: (group as any)._id, name: group.name },
      range: { fromDate: from, toDate: to },
      aggregate: { ...aggregate, groupRate },
      perStudent,
    };
  }

  /**
   * ⚠ `g.id` (ro'yxatdan) `getGroupSummary` ga, `g._id` esa javobga
   * ketadi. `GroupsService.list()` `withLegacyId` dan o'tgani uchun
   * IKKALASI ham mavjud — Express bilan aynan bir xil.
   */
  async getTeacherGroupsSummary(
    teacherId: string,
    { fromDate, toDate }: { fromDate?: unknown; toDate?: unknown },
  ) {
    const groups = await this.groups.listForTeacher(teacherId);
    const result: any[] = [];
    for (const g of groups as any[]) {
      const summary = await this.getGroupSummary(g.id, { fromDate, toDate });
      result.push({
        group: { _id: g._id, name: g.name, schedule: g.schedule },
        groupRate: summary.aggregate.groupRate,
        aggregate: summary.aggregate,
      });
    }
    return result;
  }

  // ═══════════════════════ DASHBOARD ═══════════════════════

  /**
   * Barcha hisob-kitob 5 ta so'rovda (oldingi N+1 kaskad o'rniga).
   *
   * ⚠ FILIAL: dashboard ilgari BUTUN tizim guruhlarini olardi va
   * boshqa filial davomati ham hisobga tushardi.
   */
  async getDashboardStats({
    fromDate, toDate, page = 1, limit = 20,
  }: { fromDate?: unknown; toDate?: unknown; page?: number; limit?: number }) {
    const settings = await this.settings.get();
    const from = parseLocalDay(fromDate)!;
    const to = parseLocalDay(toDate)!;

    const groups = await this.prisma.group.findMany({
      where: { ...branchFilter(), isActive: true, isDeleted: false },
      select: GROUP_SELECT,
    });
    const groupIds = groups.map((g) => g.id);

    const groupMemberships = await this.prisma.groupMembership.findMany({
      where: {
        groupId: { in: groupIds },
        joinedAt: { lte: to },
        OR: [{ leftAt: null }, { leftAt: { gte: from } }],
        isDeleted: false,
      },
      /**
       * ⚠ B17 — `joinedAt` / `leftAt` QO'SHILDI (2026-08-22).
       *
       * Ilgari ular SO'RALMASDI, lekin quyida `computeClassDays` ga
       * UZATILARDI — ya'ni har doim `undefined` bo'lib borardi va
       * natijada HAR BIR o'quvchi BUTUN oraliq davomida a'zo bo'lgan
       * deb hisoblanardi.
       *
       * O'LCHANDI (2026-08-01 … 08-22 oynasi): 1274 a'zolikdan 184
       * tasi (14.4%) oyna O'RTASIDA qo'shilgan yoki chiqqan; 28028
       * kundan 1633 tasi (5.8%) ortiqcha sanalgan.
       *
       * OQIBATI FOIZDA: `groupRate = present / totalClasses`, ya'ni
       * shishirilgan maxraj davomat foizini PASAYTIRARDI — raqamlar
       * haqiqatdan YOMONROQ ko'rinardi.
       */
      select: {
        groupId: true, studentId: true, joinedAt: true, leftAt: true,
        student: { select: STUDENT_SELECT },
      },
    });

    const studentIdSet = new Set<string>();
    for (const m of groupMemberships) {
      if (m.student) studentIdSet.add(String(m.student.id));
    }
    const studentIds = Array.from(studentIdSet);

    /**
     * ⚠ `groupId: { in: groupIds }` CHEKLOVI SHART. Usiz aggregate
     * NOFAOL/o'chirilgan guruhlardan ham dars kunlarini qo'shib,
     * `groupBreakdown` (faqat aktiv guruhlar) bilan ZIDDIYATGA
     * kelardi: `aggregate.totalClasses ≠ Σ groupBreakdown.totalClasses`.
     */
    const [allMemberships, exemptions, attendances, holidaySet] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: {
          studentId: { in: studentIds },
          groupId: { in: groupIds },
          joinedAt: { lte: to },
          OR: [{ leftAt: null }, { leftAt: { gte: from } }],
          isDeleted: false,
        },
        select: {
          studentId: true, joinedAt: true, leftAt: true,
          group: { select: GROUP_SELECT },
        },
      }),
      this.freezes.loadExemptionsWithFreezes(studentIds),
      // ⚠ `dateKey` bo'yicha filtrlanadi (`date` EMAS) — summary
      // yo'llari bilan bir xil KUN semantikasi. Aks holda `date`
      // maydonida vaqt komponenti bo'lgan (seed/legacy) yozuvlar
      // oraliqning oxirgi kunida tushib qolib, dashboard
      // ko'rsatkichlari summary bilan ziddiyatga kelardi.
      this.prisma.attendance.findMany({
        where: {
          studentId: { in: studentIds },
          dateKey: { gte: dateKeyOf(from)!, lte: dateKeyOf(to)! },
          isDeleted: false,
        },
      }),
      this.holidays.holidayKeySetForRange(from, to),
    ]);

    const groupBy = <T>(docs: T[], keyOf: (d: T) => string) => {
      const map = new Map<string, T[]>();
      for (const d of docs) {
        const k = keyOf(d);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(d);
      }
      return map;
    };
    const membershipsByStudent = groupBy(allMemberships, (m) => String(m.studentId));
    const exemptionsByStudent = groupBy(exemptions, (ex: any) =>
      String(ex.studentId ?? ex.student),
    );
    const attendancesByStudent = groupBy(attendances, (a) => String(a.studentId));

    const studentDocById = new Map<string, any>();
    for (const m of groupMemberships) {
      if (m.student) studentDocById.set(String(m.student.id), m.student);
    }

    /**
     * ⚠ att-correctness-2: har o'quvchi FAQAT BIR MARTA hisoblanadi.
     * Ilgari har guruh a'zoligi uchun takror qo'shilib, ko'p guruhdagi
     * o'quvchi sonlarini N MARTA shishirardi.
     */
    const aggregate: Record<string, number> = {
      present: 0, absent: 0, excused: 0, late: 0, exempt: 0,
      unmarked: 0, totalClasses: 0,
    };
    const studentRates = new Map<string, any>();
    for (const sid of studentIdSet) {
      const { total, cells } = computeClassDays({
        memberships: (membershipsByStudent.get(sid) || []) as never,
        exemptions: (exemptionsByStudent.get(sid) || []) as never,
        from, to, holidaySet,
      });
      const s = summarizeCells({
        total, cells, attendances: (attendancesByStudent.get(sid) || []) as never,
      });
      aggregate.present += s.present as number;
      aggregate.absent += s.absent as number;
      aggregate.excused += s.excused as number;
      aggregate.late += s.late as number;
      aggregate.exempt += s.exempt as number;
      aggregate.unmarked += (s.unmarked as number) || 0;
      aggregate.totalClasses += s.totalClasses as number;

      const doc = studentDocById.get(sid);
      studentRates.set(sid, {
        student: doc ? withLegacyId(doc) : { _id: sid },
        present: s.present, absent: s.absent, late: s.late,
        exempt: s.exempt, excused: s.excused, totalClasses: s.totalClasses,
      });
    }

    /**
     * ⚠ att-correctness-1: har `(o'quvchi, guruh)` SHU GURUH bo'yicha
     * ALOHIDA hisoblanadi. Ilgari cross-group summary guruhga
     * qo'shilib, guruh foiziga BEGONA guruhlar davomatini aralashtirardi.
     */
    const membershipsByGroup = groupBy(
      groupMemberships.filter((m) => m.student),
      // ⚠ `m.group` EMAS, `m.groupId`: `group` RELATION obyekti bo'lardi
      // va `String(...)` uni "[object Object]" ga aylantirib, HAR BIR
      // guruh bo'sh ro'yxat olardi.
      (m) => String(m.groupId),
    );
    const groupBreakdownAll: any[] = [];

    for (const g of groups) {
      const members = membershipsByGroup.get(String(g.id)) || [];
      const gAgg: Record<string, number> = {
        present: 0, absent: 0, excused: 0, late: 0, exempt: 0,
        unmarked: 0, totalClasses: 0,
      };

      for (const m of members) {
        const sid = String(m.student!.id);
        /**
         * ⚠ B17 TUZATILDI (2026-08-22) — `joinedAt`/`leftAt` ENDI
         * HAQIQIY QIYMAT.
         *
         * Ilgari ular yuqoridagi `select` da SO'RALMAGANI uchun har
         * doim `undefined` edi va `computeClassDays` da shunday
         * tugardi:
         *   `effFrom = m.joinedAt > from ? … : from` → `undefined > from`
         *             HAR DOIM `false` → `effFrom = from`
         *   `leftBound = m.leftAt ? … : null`        → `null` → `effTo = to`
         * Ya'ni har bir o'quvchi BUTUN oraliq davomida a'zo bo'lgan
         * deb hisoblanardi.
         *
         * ⚠ `as never` OLIB TASHLANDI — aynan u TypeScript'ning
         * ogohlantirishini bostirib turgan edi. Endi tur tekshiruvi
         * bu nuqsonning QAYTA kirib kelishiga yo'l qo'ymaydi.
         *
         * Endi `getGroupSummary` bilan AYNI ma'lumot uchun AYNI son
         * chiqadi (ilgari ikkalasi boshqa-boshqa javob berardi).
         */
        const { total, cells } = computeClassDays({
          memberships: [{
            joinedAt: m.joinedAt,
            leftAt: m.leftAt,
            group: g as never,
          }] as never,
          exemptions: (exemptionsByStudent.get(sid) || []) as never,
          from, to, holidaySet,
        });
        const s = summarizeCells({
          total, cells, attendances: (attendancesByStudent.get(sid) || []) as never,
        });
        gAgg.present += s.present as number;
        gAgg.absent += s.absent as number;
        gAgg.excused += s.excused as number;
        gAgg.late += s.late as number;
        gAgg.exempt += s.exempt as number;
        gAgg.unmarked += (s.unmarked as number) || 0;
        gAgg.totalClasses += s.totalClasses as number;
      }

      groupBreakdownAll.push({
        groupId: g.id,
        name: g.name,
        groupRate: computeRate(gAgg as never),
        totalClasses: gAgg.totalClasses,
      });
    }

    const overallRate = computeRate(aggregate as never);

    const studentList = Array.from(studentRates.values()).map((s) => ({
      ...s, rate: computeRate(s),
    }));

    const lowAttendanceStudents = studentList
      .filter((s) => s.rate !== null && s.rate < (settings as any).lowAttendanceThreshold)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 20);

    const topAbsent = [...studentList]
      .sort((a, b) => b.absent - a.absent)
      .filter((s) => s.absent > 0)
      .slice(0, 10);

    // `groupBreakdown` NOM bo'yicha tartiblanib sahifalanadi (umumiy
    // ko'rsatkichlar TO'LIQ qoladi).
    groupBreakdownAll.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uz'));
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 20));
    const safePage = Math.max(1, Number(page) || 1);
    const start = (safePage - 1) * safeLimit;
    const groupBreakdown = groupBreakdownAll.slice(start, start + safeLimit);

    return {
      overallRate,
      aggregate,
      threshold: (settings as any).lowAttendanceThreshold,
      studentsCount: studentList.length,
      lowAttendanceStudents,
      topAbsent,
      groupBreakdown,
      groupBreakdownMeta: buildMeta({
        page: safePage, limit: safeLimit, total: groupBreakdownAll.length,
      }),
    };
  }

  // ═══════════════════════ KETMA-KET QOLDIRISH ═══════════════════════

  /**
   * ⚠ `dateKey` BO'YICHA (`date` EMAS): `dateKey` har doim
   * normalizatsiyalangan "YYYY-MM-DD", vaqt komponentidan xoli. `date`
   * bilan solishtirilsa, seed/legacy yozuvlardagi vaqt tufayli bugungi
   * qoldirish "kelajak" deb TUSHIB QOLARDI.
   *
   * ⚠ FILIAL: guruh berilmasa barcha guruhlar bo'yicha yuriladi —
   * `Attendance` da `branchId` YO'Q, shuning uchun GURUH orqali.
   */
  async consecutiveAbsences(studentId: string, groupId: string | null = null) {
    const filter: Record<string, unknown> = {
      studentId: String(studentId),
      isDeleted: false,
      dateKey: { lte: localTodayKey()! },
    };
    if (groupId) {
      filter.groupId = String(groupId);
    } else {
      Object.assign(filter, await this.branchAccess.branchGroupFilter('groupId'));
    }
    const recent = await this.prisma.attendance.findMany({
      where: filter,
      orderBy: { dateKey: 'desc' },
      take: 50,
    });
    let count = 0;
    for (const a of recent) {
      if (a.status === 'absent') count += 1;
      else break;
    }
    return count;
  }
}
