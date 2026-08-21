import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { isBranchAllowed } from '../../common/als/branch-context.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-request.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NARX YECHUVCHI + narx matritsasi —
 * `modules/courses/services/coursePrice.service.js` KO'CHIRMASI.
 *
 * ⚠ NARX QATORI HECH QACHON O'CHIRILMAYDI. O'zgartirish = eski davrni
 * `validTo` bilan YOPISH + yangi qator OCHISH. Sabab: o'tgan oylarni
 * qayta hisoblaganda O'SHA PAYTDAGI narx kerak; o'chirilsa tarix
 * jimgina qayta yozilardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Manbalar — javobda "narx qayerdan keldi" ko'rinishi uchun. */
export const PRICE_SOURCES = Object.freeze({
  GROUP_FEE: 'group_fee',
  BRANCH_PRICE: 'branch_price',
  BASE_PRICE: 'base_price',
  NONE: 'none',
});

const toObjectId = (id: unknown): string | null => (id ? String(id) : null);

@Injectable()
export class CoursePriceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Berilgan sanada AMALDA bo'lgan narx.
   *
   * Filial istisnosi bazaviydan USTUN: avval `(kurs, filial)`
   * qidiriladi, topilmasa `(kurs, null)`.
   */
  private async findPriceRow(courseId: string, branchId: string | null, at?: Date) {
    const when = at || new Date();
    const base = {
      courseId: toObjectId(courseId)!,
      isDeleted: false,
      validFrom: { lte: when },
      OR: [{ validTo: null }, { validTo: { gt: when } }],
    };

    if (branchId) {
      const branchRow = await this.prisma.coursePrice.findFirst({
        where: { ...base, branchId: toObjectId(branchId) },
        orderBy: { validFrom: 'desc' },
      });
      if (branchRow) {
        return { row: branchRow, source: PRICE_SOURCES.BRANCH_PRICE };
      }
    }

    const baseRow = await this.prisma.coursePrice.findFirst({
      where: { ...base, branchId: null },
      orderBy: { validFrom: 'desc' },
    });
    if (baseRow) return { row: baseRow, source: PRICE_SOURCES.BASE_PRICE };

    return null;
  }

  /**
   * GURUH uchun amaldagi narx.
   *
   * Tartib: `GroupFee` (qo'lda) → filial narxi → bazaviy narx → yo'q.
   *
   * ⚠ `GroupFee` ENG KUCHLI: u aniq bir guruhga, aniq bir oyga QO'LDA
   * qo'yilgan qaror. Katalog narxi uni bosib ketsa, owner kiritgan
   * istisno JIMGINA yo'qolardi.
   */
  async resolveGroupPrice(
    groupId: string,
    { year, month }: { year?: number; month?: number } = {},
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: String(groupId) },
      select: { courseId: true, branchId: true },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');

    // 1) Guruhga qo'lda qo'yilgan narx (oy bo'yicha).
    if (year && month) {
      const fee = await this.prisma.groupFee.findFirst({
        where: {
          groupId: toObjectId(groupId)!,
          year: Number(year),
          month: Number(month),
        },
        select: { amount: true },
      });
      if (fee) {
        return { amount: fee.amount, source: PRICE_SOURCES.GROUP_FEE, priceId: null };
      }
    }

    // 2–3) Katalog narxi. Kurs biriktirilmagan bo'lsa — meros yo'q.
    if (!group.courseId) {
      return { amount: null, source: PRICE_SOURCES.NONE, priceId: null };
    }

    // Sana: oy berilgan bo'lsa O'SHA oyning 1-sanasi (tarixiy qayta
    // hisoblashda O'SHA PAYTDAGI narx olinishi uchun), aks holda bugun.
    const at =
      year && month
        ? new Date(Date.UTC(Number(year), Number(month) - 1, 1))
        : new Date();

    const found = await this.findPriceRow(group.courseId, group.branchId, at);
    if (!found) return { amount: null, source: PRICE_SOURCES.NONE, priceId: null };

    return {
      amount: found.row.amount,
      source: found.source,
      priceId: String(found.row.id),
    };
  }

  /**
   * Kurs bo'yicha butun matritsa: bazaviy narx + filial istisnolari.
   *
   * ⚠ FILIAL KO'LAMI: cheklangan foydalanuvchi FAQAT o'z filiallarining
   * istisnolarini ko'radi. BAZAVIY narx hammaga ko'rinadi — u global
   * katalogning bir qismi.
   */
  async listForCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: { id: true, title: true, code: true },
    });
    if (!course) throw new ApiError(404, 'Kurs topilmadi');

    const rows = await this.prisma.coursePrice.findMany({
      where: { courseId: toObjectId(courseId)!, isDeleted: false, validTo: null },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });

    const visible = rows.filter((r) => !r.branchId || isBranchAllowed(r.branchId));

    // `isPending` — narx KELAJAKDA boshlanadi.
    //
    // NEGA KERAK: bu ro'yxat `validTo: null` qatorlarni beradi, ya'ni
    // "amaldagi YOZUV"ni. Lekin `validFrom` kelajakda bo'lsa, u hali
    // HISOBLANMAYDI — guruhlar eski narxda to'laydi. Bayroqsiz owner
    // matritsada 600 000 ni ko'rib, hisobotda 500 000 ni topardi va
    // buni xato deb o'ylardi.
    const now = new Date();
    const annotate = (r: (typeof rows)[number]) => ({
      ...(withLegacyId(r) as Record<string, unknown>),
      // Klient `branchId` ni obyekt sifatida kutadi (eski populate shakli).
      branchId: r.branch ? withLegacyId(r.branch) : null,
      isPending: new Date(r.validFrom).getTime() > now.getTime(),
    });

    return {
      course,
      base: visible.filter((r) => !r.branchId).map(annotate)[0] || null,
      branches: visible.filter((r) => r.branchId).map(annotate),
    };
  }

  /**
   * Narx belgilash (yoki o'zgartirish).
   *
   * ESKI NARX O'CHIRILMAYDI — uning `validTo` si yopiladi va yangi
   * qator ochiladi.
   */
  async setPrice(
    {
      courseId,
      branchId = null,
      amount,
      validFrom,
      note,
    }: {
      courseId: string;
      branchId?: string | null;
      amount: number;
      validFrom?: Date;
      note?: string;
    },
    currentUser?: AuthenticatedUser,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: { id: true },
    });
    if (!course) throw new ApiError(404, 'Kurs topilmadi');

    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiError(400, "Narx manfiy bo'lmagan son bo'lishi kerak");
    }

    // FILIAL ISTISNOSI faqat O'Z filialiga. Aks holda A filial
    // direktori B filialning narxini o'zgartirib qo'yardi.
    if (branchId && !isBranchAllowed(branchId)) {
      throw new ApiError(403, "Bu filialga narx belgilash huquqingiz yo'q");
    }

    const from = validFrom ? new Date(validFrom) : new Date();
    const branch = branchId ? toObjectId(branchId) : null;

    const open = await this.prisma.coursePrice.findFirst({
      where: {
        courseId: toObjectId(courseId)!,
        branchId: branch,
        validTo: null,
        isDeleted: false,
      },
    });

    if (open) {
      // Bir xil summa — yangi qator ochish shart emas (shovqin bo'lardi).
      if (Number(open.amount) === value) return withLegacyId(open);

      if (from.getTime() <= new Date(open.validFrom).getTime()) {
        throw new ApiError(
          400,
          'Yangi narx amaldagi narx boshlangan sanadan keyin boshlanishi kerak',
        );
      }
    }

    // ESKI DAVRNI YOPISH va YANGISINI OCHISH — BITTA TRANZAKSIYADA.
    //
    // ⚠ ORADAGI XATO XAVFLI: "eski narx yopilgan, yangisi yo'q" holati
    // kursni NARXSIZ qoldirardi va hisob-kitob jimgina 0 ga tushardi.
    //
    // ⚠ `count()` — ATAYLAB qo'yilgan NO-OP. `$transaction` massivining
    // SHAKLI (uzunligi) ikkala shoxda bir xil qolishi uchun, natijada
    // `created` DOIM ikkinchi element bo'ladi.
    const [, created] = await this.prisma.$transaction([
      open
        ? this.prisma.coursePrice.update({
            where: { id: open.id },
            data: { validTo: from },
          })
        : this.prisma.coursePrice.count(),
      this.prisma.coursePrice.create({
        data: {
          courseId: toObjectId(courseId)!,
          branchId: branch,
          amount: value,
          validFrom: from,
          note: String(note || '').trim(),
          createdById: currentUser?.id || currentUser?._id || null,
        },
      }),
    ]);

    return withLegacyId(created);
  }

  /**
   * Filial istisnosini olib tashlash — kurs BAZAVIY narxga qaytadi.
   * Bazaviy narxni o'chirib bo'lmaydi (u yagona zaxira).
   */
  async clearBranchPrice(
    courseId: string,
    branchId: string,
    _currentUser?: AuthenticatedUser,
  ) {
    if (!branchId) {
      throw new ApiError(400, "Bazaviy narxni o'chirib bo'lmaydi - uni o'zgartiring");
    }
    if (!isBranchAllowed(branchId)) {
      throw new ApiError(403, "Bu filialga narx belgilash huquqingiz yo'q");
    }

    const open = await this.prisma.coursePrice.findFirst({
      where: {
        courseId: toObjectId(courseId)!,
        branchId: toObjectId(branchId),
        validTo: null,
        isDeleted: false,
      },
    });
    if (!open) throw new ApiError(404, "Bu filial uchun istisno narx yo'q");

    // Davrni YOPAMIZ (o'chirmaymiz) — tarix saqlanadi.
    const closed = await this.prisma.coursePrice.update({
      where: { id: open.id },
      data: { validTo: new Date() },
    });
    return withLegacyId(closed);
  }
}
