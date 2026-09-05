import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { branchFilter } from '../../common/als/branch-context.js';

/**
 * CHIQIM KATEGORIYALARI - owner boshqaradi (ArchiveReason naqshi).
 *
 * UMUMIY KATEGORIYA (branchId = null) - `OR` NING O'RNI:
 * Prisma'da `OR` boshqa shartlar bilan BIR DARAJADA turolmaydi
 * (`isDeleted` va `isActive` ham kerak), shuning uchun
 * `AND: [{ OR: [...] }, ...]` shakli ishlatiladi.
 */

interface Actor { id?: string | null; _id?: string | null }
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

/**
 * Filial ko'lami + UMUMIY yozuvlar.
 *
 * Umumiy (branchId = null) kategoriyalar HAR DOIM ko'rinadi - aks
 * holda "Ijara" kabi standart kategoriyalar filial tanlanganda
 * yo'qolardi va operator ularni qaytadan yaratib, dublikat qilardi.
 */
const scopeWithShared = (): Record<string, unknown>[] => {
  const bf = branchFilter();
  if (!Object.keys(bf).length) return [];
  return [{ OR: [bf, { branchId: null }] }];
};

@Injectable()
export class ExpenseCategoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list({ includeInactive = false }: { includeInactive?: boolean } = {}) {
    const where = {
      isDeleted: false,
      ...(includeInactive ? {} : { isActive: true }),
      AND: scopeWithShared(),
    };
    return withLegacyIds(
      await this.prisma.expenseCategory.findMany({
        where: where as never,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async create(
    body: {
      name: string; code?: string; kind?: string; branchId?: string | null;
      sortOrder?: number; isActive?: boolean;
    },
    currentUser?: Actor | null,
  ) {
    try {
      return withLegacyId(
        await this.prisma.expenseCategory.create({
          data: {
            name: String(body.name).trim(),
            code: body.code ? String(body.code).trim().toLowerCase() : null,
            kind: (body.kind || 'operating') as never,
            branchId: body.branchId || null,
            sortOrder: Number(body.sortOrder) || 0,
            isActive: body.isActive !== false,
            createdById: actorId(currentUser),
          } as never,
        }),
      );
    } catch (err) {
      // QISMAN UNIQUE: (branchId, name) WHERE isDeleted = false.
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ApiError(409, 'Bunday nomli kategoriya allaqachon mavjud');
      }
      throw err;
    }
  }

  private async loadCategory(id: string) {
    // FILIAL: `list()` bilan AYNI kesish (`scopeWithShared()`).
    //
    // Filtrsiz `update()`/`remove()` begona filialning kategoriyasini
    // ID bo'yicha qayta nomlash, o'chirib qo'yish yoki butunlay
    // o'chirishga yo'l qo'yardi — ro'yxatda ko'rinmasa ham.
    //
    // ⚠ UMUMIY (branchId = null) KATEGORIYALAR ILGARIGIDEK OCHIQ:
    // `scopeWithShared()` ularni ataylab qo'shadi (yuqoridagi izoh) va
    // bu tuzatish o'sha kelishuvni O'ZGARTIRMAYDI — u faqat FILIALGA
    // TEGISHLI kategoriyaning begonaga ochiqligini yopadi.
    const doc = await this.prisma.expenseCategory.findFirst({
      where: { id: String(id), isDeleted: false, AND: scopeWithShared() } as never,
    });
    if (!doc) throw new ApiError(404, 'Kategoriya topilmadi');
    return doc;
  }

  async update(
    id: string,
    body: { name?: string; kind?: string; sortOrder?: number; isActive?: boolean },
    _currentUser?: Actor | null,
  ) {
    const doc = await this.loadCategory(id);

    // TIZIM kategoriyasining TURINI o'zgartirib bo'lmaydi: maosh
    // "payroll" dan chiqarilsa hisobotda ikki marta sanalardi.
    if (doc.isSystem && body.kind && body.kind !== doc.kind) {
      throw new ApiError(400, "Tizim kategoriyasining turini o'zgartirib bo'lmaydi");
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.kind !== undefined) data.kind = body.kind;
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    // `updatedBy` USTUNI YO'Q — Mongoose sxemada ham yo'q edi va
    // `doc.updatedBy = ...` jimgina tashlab yuborilardi. Postgres esa
    // "Unknown argument" bilan yiqilardi, shuning uchun ko'chirilmadi.
    // Kim o'zgartirgani `activity-logs` da bor.

    try {
      return withLegacyId(
        await this.prisma.expenseCategory.update({
          where: { id: doc.id }, data: data as never }),
      );
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ApiError(409, 'Bunday nomli kategoriya allaqachon mavjud');
      }
      throw err;
    }
  }

  /**
   * Kategoriyani o'chiradi (soft).
   *
   * ISHLATILGAN kategoriyani o'chirish MUMKIN EMAS - hisobotdagi eski
   * chiqimlar "kategoriyasiz" bo'lib qolardi. Buning o'rniga NOFAOL
   * qilish taklif etiladi.
   *
   * POSTGRES'DA BU IKKI QATLAMLI: `Expense.categoryId` haqiqiy FK
   * (RESTRICT). Quyidagi tekshiruv esa foydalanuvchiga TUSHUNARLI
   * xato beradi — FK xatosi "violates foreign key constraint" deb
   * chiqardi.
   */
  async remove(id: string, currentUser?: Actor | null) {
    const doc = await this.loadCategory(id);
    if (doc.isSystem) {
      throw new ApiError(400, "Tizim kategoriyasini o'chirib bo'lmaydi");
    }

    const used = await this.prisma.expense.count({
      where: { categoryId: doc.id, isDeleted: false },
    });
    if (used) {
      throw new ApiError(
        400,
        "Bu kategoriya bo'yicha chiqimlar mavjud. O'chirish o'rniga uni nofaol qiling.",
      );
    }

    await this.prisma.expenseCategory.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });
    return { ok: true };
  }
}
