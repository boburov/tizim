import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { MembershipService } from '../../common/helpers/membership.service.js';
import { CorrelationCacheService } from '../../common/helpers/correlation-cache.service.js';
import { userBranchCondition } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';

/**
 * DAVOMATDAN OZOD DAVRLARI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * MAYDON NOMI: `student` -> `studentId`
 *
 * Mongo'da bu ObjectId ref bo'lib `student` deb atalardi; Prisma'da
 * skalyar ustun `studentId`, `student` esa RELATION. `{ student: id }`
 * deb yozilsa Prisma uni relation filtri deb o'qiydi va butunlay
 * boshqa ma'no chiqadi.
 *
 * KLIENT SHARTNOMASI O'ZGARMAYDI: forma hamon `{ student }` yuboradi
 * (ExemptionCreateModal), shuning uchun kirishda `body.student`
 * o'qiladi va servis ichida `studentId` ga aylantiriladi.
 * ═══════════════════════════════════════════════════════════════════
 */

interface Actor {
  id?: string | null;
  _id?: string | null;
  role?: string;
}

/**
 * ⚠ `_id` HAM, `id` HAM QABUL QILINADI.
 *
 * Express servisi `currentUser._id` ni o'qiydi (Mongo merosi), NestJS
 * auth middleware'i esa `req.user.id` beradi. Faqat bittasiga tayanish
 * JIMGINA `null` bergan bo'lardi: `createdById` bo'sh yozilardi va
 * o'qituvchi egaligini tekshirish `undefined` bilan chaqirilardi.
 */
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

@Injectable()
export class AttendanceExemptionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly memberships: MembershipService,
    private readonly cache: CorrelationCacheService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private async ensureStudent(studentId: string) {
    // FILIAL: begona filial o'quvchisiga ozod davri OCHIB BO'LMAYDI —
    // usiz direktor boshqa filial o'quvchisini davomatdan chiqarardi.
    // ⚠ `AND` ichida: `userBranchCondition()` OR qaytaradi.
    // Xabar O'ZGARMAYDI — o'quvchi bor-yo'qligi oshkor qilinmaydi.
    const branchCond = userBranchCondition();
    const u = await this.prisma.user.findFirst({
      where: {
        id: String(studentId),
        ...(branchCond ? { AND: [branchCond] } : {}),
      },
      select: { id: true, role: true },
    });
    if (!u || u.role !== ROLES.STUDENT) {
      throw new ApiError(400, "O'quvchi topilmadi");
    }
    return u;
  }

  async list(
    {
      studentId, isActive, page = 1, limit = 50,
    }: { studentId?: string; isActive?: boolean; page?: number; limit?: number },
    currentUser?: Actor | null,
  ) {
    // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrlarini ko'ra
    // oladi. Shuning uchun studentId majburiy va shu o'quvchi unga
    // tegishli bo'lishi shart.
    if (currentUser?.role === ROLES.TEACHER) {
      if (!studentId) {
        throw new ApiError(400, "O'quvchi tanlanmagan");
      }
      await this.memberships.ensureTeacherOwnsStudent(
        actorId(currentUser) as string, studentId);
    }

    const where: Record<string, unknown> = { isDeleted: false };
    if (studentId) where.studentId = String(studentId);
    if (isActive !== undefined) where.isActive = !!isActive;

    // FILIAL: `AttendanceExemption` da `branchId` YO'Q — yozuv
    // O'QUVCHIGA tegishli, o'quvchi esa filialga. Ko'lamsiz `list()`
    // (`studentId` berilmaganda) BUTUN markazning ozod davrlarini
    // qaytarardi: o'qituvchi `ensureTeacherOwnsStudent` bilan
    // cheklangan, xodim va direktor esa HECH NARSA bilan emas.
    // ⚠ `AND` ichida: yuqorida `studentId` kaliti band bo'lishi mumkin
    // va spread uni JIMGINA bosib ketardi.
    const scope = await this.branchAccess.branchUserFilter('studentId');
    if (Object.keys(scope).length) where.AND = [scope];

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.attendanceExemption.findMany({
        where: where as never,
        orderBy: { startDate: 'desc' },
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.attendanceExemption.count({ where: where as never }),
    ]);

    return { items: withLegacyIds(items), total, page, limit };
  }

  async create(
    body: {
      student: string; startDate: Date; endDate?: Date | null;
      daysOfWeek?: string[]; reason?: string; isActive?: boolean;
    },
    currentUser?: Actor | null,
  ) {
    await this.ensureStudent(body.student);
    // O'qituvchi faqat o'z guruhidagi o'quvchini ozod qila oladi.
    if (currentUser?.role === ROLES.TEACHER) {
      await this.memberships.ensureTeacherOwnsStudent(
        actorId(currentUser) as string, body.student);
    }
    await this.memberships.ensureActiveGroup(body.student);

    const startDate = new Date(body.startDate);
    const endDate = body.endDate ? new Date(body.endDate) : null;

    // Bu tekshiruv bazadagi `attendance_exemptions_range_check` bilan
    // BIR XIL qoidani ifodalaydi. Ikkalasi ham kerak: CHECK oxirgi
    // himoya (import/seed HTTP validatsiyasini chetlab o'tadi), bu esa
    // foydalanuvchiga TUSHUNARLI xabar beradi.
    if (endDate && startDate > endDate) {
      throw new ApiError(400, "Tugash sanasi boshlanishidan keyin bo'lishi kerak");
    }

    const created = await this.prisma.attendanceExemption.create({
      data: {
        studentId: String(body.student),
        startDate,
        endDate,
        daysOfWeek: (Array.isArray(body.daysOfWeek) ? body.daysOfWeek : []) as never,
        reason: body.reason || '',
        isActive: body.isActive !== undefined ? !!body.isActive : true,
        createdById: actorId(currentUser),
      } as never,
    });

    // Imtiyoz davomat foiziga ta'sir qiladi → korrelatsiya keshini tozalaymiz.
    //
    // ⚠ `await` QILINMAYDI — Express ham qilmaydi (`correlationCacheInvalidate()`
    // chaqiruvi `await`siz). Kesh tozalash FON amali: u tugashini kutish
    // javobni sekinlashtiradi, xatosi esa ikkala tomonda ham ichkarida
    // yutiladi. `void` — "javobni kutmayapman" degani ochiq turishi uchun.
    void this.cache.invalidate();
    return withLegacyId(created);
  }

  async getById(id: string) {
    // FILIAL: ro'yxat ko'lamlangani bilan `:id` yo'li ochiq qolgan edi —
    // begona filial o'quvchisining ozod davri id bo'yicha o'qilar,
    // `update()`/`remove()` esa uni o'zgartira olardi (IDOR).
    // ⚠ 404, 403 EMAS: yozuv MAVJUDLIGI ham oshkor qilinmaydi.
    const scope = await this.branchAccess.branchUserFilter('studentId');
    const where: Record<string, unknown> = { id: String(id), isDeleted: false };
    if (Object.keys(scope).length) where.AND = [scope];

    const doc = await this.prisma.attendanceExemption.findFirst({
      where: where as never,
    });
    if (!doc) throw new ApiError(404, 'Davomatdan ozod davri topilmadi');
    return doc;
  }

  async update(
    id: string,
    body: {
      startDate?: Date; endDate?: Date | null; daysOfWeek?: string[];
      reason?: string; isActive?: boolean;
    },
    currentUser?: Actor | null,
  ) {
    const doc = await this.getById(id);
    // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrini
    // tahrirlay oladi.
    if (currentUser?.role === ROLES.TEACHER) {
      await this.memberships.ensureTeacherOwnsStudent(
        actorId(currentUser) as string, doc.studentId);
    }

    // MONGO'DA BU `doc.save()` EDI: hujjat o'zgartirilib, keyin butunlay
    // qayta yozilardi. Prisma'da faqat BERILGAN maydonlar yangilanadi,
    // shuning uchun tekshiruv uchun "keyingi holat" alohida hisoblanadi -
    // aks holda faqat `endDate` o'zgartirilganda uni ESKI `startDate`
    // bilan solishtirish kerakligi ko'zdan qochardi.
    const data: Record<string, unknown> = {};
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) {
      data.endDate = body.endDate ? new Date(body.endDate) : null;
    }
    if (body.daysOfWeek !== undefined) {
      data.daysOfWeek = Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [];
    }
    if (body.reason !== undefined) data.reason = body.reason;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const nextStart = (data.startDate as Date) ?? doc.startDate;
    const nextEnd = data.endDate !== undefined
      ? (data.endDate as Date | null)
      : doc.endDate;
    if (nextEnd && nextStart > nextEnd) {
      throw new ApiError(400, "Tugash sanasi boshlanishidan keyin bo'lishi kerak");
    }

    const updated = await this.prisma.attendanceExemption.update({
      where: { id: doc.id },
      data: data as never,
    });
    void this.cache.invalidate();
    return withLegacyId(updated);
  }

  async remove(id: string, currentUser?: Actor | null) {
    const doc = await this.getById(id);
    // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrini o'chira
    // oladi.
    if (currentUser?.role === ROLES.TEACHER) {
      await this.memberships.ensureTeacherOwnsStudent(
        actorId(currentUser) as string, doc.studentId);
    }

    // Mongoose plugin'idagi `softDelete()` o'rniga ochiq yozamiz -
    // plugin Prisma'da yo'q.
    const removed = await this.prisma.attendanceExemption.update({
      where: { id: doc.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: actorId(currentUser),
      },
    });
    void this.cache.invalidate();
    return withLegacyId(removed);
  }
}
