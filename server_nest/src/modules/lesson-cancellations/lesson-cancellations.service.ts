import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { parseLocalDay, dateKeyOf } from '../../common/utils/date.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { StudentPaymentService } from '../finance/student-payment.service.js';
import { TeacherSalaryService } from '../teacher-salary/teacher-salary.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BEKOR QILINGAN DARS — `lessonCancellation.service.js` NING KO'CHIRMASI.
 *
 * Har bir yozuv/o'chirish MOLIYAGA ta'sir qiladi (o'quvchi qarzi va
 * o'qituvchining soatbay maoshi DARS SONIGA bog'liq), shuning uchun o'sha
 * oy DARHOL qayta hisoblanadi. Tungi job'ni kutish "nega qarz
 * o'zgarmadi?" degan savolni tug'dirardi.
 *
 * ⚠ `helpers/lessonCancellation.helper.js` (`loadCancelledLessonKeys`)
 * BU YERDA EMAS — u `common/helpers/lesson-cancellation.service.ts` da
 * va uni to'lov ham, maosh ham AYNI joydan o'qiydi. Ikkinchi nusxa
 * "o'quvchi to'lamagan dars uchun o'qituvchiga haq to'lanadi" turidagi
 * ajralishni tug'dirardi.
 *
 * ⚠ TAKRORLANISH KODI: Mongo dublikat kalitni `11000`, Prisma esa
 * `P2002` bilan qaytaradi. Eski tekshiruvni qoldirish 409 o'rniga xom
 * 500 berardi — qisman unique indeks o'z ishini qilardi-yu,
 * foydalanuvchi sababni ko'rmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class LessonCancellationsService {
  private readonly logger = new Logger('LessonCancellationsService');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly payments: StudentPaymentService,
    private readonly salaries: TeacherSalaryService,
  ) {}

  private async assertGroup(groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter(), isDeleted: false },
      select: { id: true, name: true },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');
    return group;
  }

  /**
   * Moliya kaskadi: shu oyning to'lovlari va maoshlari qayta hisoblanadi.
   *
   * ⚠ BEST-EFFORT — kaskad xatosi yozuvni BEKOR QILMAYDI (u allaqachon
   * saqlangan va to'g'ri; tungi job qolganini tuzatadi).
   */
  private async recomputeMonth(groupId: string, date: Date): Promise<void> {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    try {
      await this.payments.recalcForGroupMonth(groupId, year, month);
      await this.salaries.recalcForGroupMonth(groupId, year, month);
    } catch (err) {
      this.logger.warn(
        `Dars bekor qilingach moliya qayta hisoblanmadi ` +
          `(${groupId} ${year}-${month}): ${(err as Error).message}`,
      );
    }
  }

  async create(body: any, currentUser?: any) {
    const group = await this.assertGroup(body.group);
    const date = parseLocalDay(body.date);
    if (!date) throw new ApiError(400, "Sana noto'g'ri");

    try {
      const doc = await this.prisma.lessonCancellation.create({
        data: {
          groupId: group.id,
          date,
          dateKey: dateKeyOf(date),
          slot: body.slot || '',
          reason: body.reason || 'other',
          note: body.note || '',
          // Ko'chirilgan (makeup) bo'lsa dars baribir o'tiladi → pul
          // o'zgarmaydi.
          billable: Boolean(body.makeupDate) || Boolean(body.billable),
          makeupDate: body.makeupDate ? parseLocalDay(body.makeupDate) : null,
          createdById: currentUser?.id || currentUser?._id || null,
        } as never,
      });
      await this.recomputeMonth(doc.groupId, date);
      return withLegacyId(doc);
    } catch (err: any) {
      // Qisman unique indeks: (groupId, dateKey, slot) WHERE isDeleted = false.
      if (err?.code === 'P2002') {
        throw new ApiError(409, 'Bu dars allaqachon bekor qilingan deb belgilangan');
      }
      throw err;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * ⚠ FILIAL KO'LAMI — ILGARI UMUMAN YO'Q EDI (IKKALA STEKDA).
   *
   * `where` faqat `{ isDeleted: false }` edi va `groupId` berilmasa
   * BUTUN TASHKILOTNING bekor qilingan darslari qaytardi: guruh nomi,
   * sana, sabab, IZOH va kim yozgani. Filial direktori boshqa
   * filiallarning ish tafsilotlarini ko'rardi.
   *
   * `LessonCancellation` da `branchId` YO'Q — u GURUHGA tegishli, guruh
   * esa filialga. Shuning uchun qo'shni modullardagi AYNI helper
   * ishlatiladi: `branchGroupFilter('groupId')`.
   *
   * ⚠ ANIQ `groupId` berilgan bo'lsa ham KO'LAM TEKSHIRILADI: aks holda
   * guruh ID'sini qo'lda berish orqali filtr butunlay chetlab
   * o'tilardi (`discount.list` dagi bilan bir xil naqsh).
   *
   * ⚠ IKKALA STEKDA BIR VAQTDA tuzatildi — aks holda paritet ataylab
   * buzilib, tuzatish "ko'chirish regressiyasi" bo'lib ko'rinardi.
   * ═══════════════════════════════════════════════════════════════════
   */
  async list({ groupId, year, month }: {
    groupId?: string; year?: number; month?: number;
  }) {
    const scope: any = await this.branchAccess.branchGroupFilter('groupId');
    const where: any = { ...scope, isDeleted: false };

    if (groupId) {
      const gid = String(groupId);
      const allowed = scope.groupId?.in;
      if (allowed && !allowed.some((id: unknown) => String(id) === gid)) return [];
      where.groupId = gid;
    }
    if (year && month) {
      where.date = {
        gte: new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
        lte: new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999)),
      };
    }
    const rows = await this.prisma.lessonCancellation.findMany({
      where,
      include: {
        group: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
    });
    return withLegacyIds(rows);
  }

  async remove(id: string, currentUser?: any) {
    const doc = await this.prisma.lessonCancellation.findFirst({
      where: { id: String(id), isDeleted: false },
      select: { id: true, groupId: true, date: true },
    });
    if (!doc) throw new ApiError(404, 'Yozuv topilmadi');
    // ⚠ KO'LAM TEKSHIRUVI YOZUVDAN KEYIN: begona filial guruhi bo'lsa
    // `assertGroup` 404 beradi (mavjudligi ham oshkor qilinmaydi).
    await this.assertGroup(doc.groupId);

    await this.prisma.lessonCancellation.update({
      where: { id: doc.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: currentUser?.id || currentUser?._id || null,
      },
    });
    // Bekor qilish olib tashlandi → dars qaytadi → qarz va maosh oshadi.
    await this.recomputeMonth(doc.groupId, doc.date);
    return { ok: true };
  }
}
