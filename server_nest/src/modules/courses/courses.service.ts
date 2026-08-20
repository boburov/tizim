import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { branchFilter } from '../../common/als/branch-context.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-request.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KURS KATALOGI — `modules/courses/services/courses.service.js` KO'CHIRMASI.
 *
 * KATALOG GLOBAL: yozish faqat owner'da (`courses.manage` —
 * `permissionScope.js` da OWNER_ONLY). Filiallar o'zicha yangi nom
 * o'ylab topsa, "A filial IELTS" va "B filial IELTS" alohida qator
 * bo'lib chiqardi va tarmoq hisobotini birlashtirib bo'lmasdi.
 * O'QISH esa hammaga — guruh yaratishda kurs tanlanadi.
 *
 * ⚠ SHUNING UCHUN `list`/`getById` DA `branchFilter()` YO'Q — kurs
 * qatorining O'ZI filialga tegishli emas. Filtr FAQAT `groupCount`
 * hisobiga qo'llanadi (pastga qarang).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class CoursesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** ⚠ STANDART `limit` = 100 (xonalarda 200, umumiy yordamchida 20). */
  async list({
    search,
    includeInactive = false,
    page = 1,
    limit = 100,
  }: {
    search?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (search && search.trim()) {
      const q = { contains: search.trim(), mode: 'insensitive' };
      where.OR = [{ title: q }, { code: q }];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
        skip,
        take: limit,
        include: { leadDirection: { select: { id: true, name: true } } },
      }),
      this.prisma.course.count({ where }),
    ]);

    // GURUHLAR SONI — katalogda "bu kurs ishlatilyaptimi" ko'rinishi uchun.
    //
    // ⚠ FILIAL KO'LAMI AYNAN SHU YERDA QO'LLANADI: katalogning o'zi
    // global, lekin SON filialga tegishli. A filial direktori
    // "IELTS — 12 guruh" degan raqamni ko'rsa-yu, uning 9 tasi boshqa
    // filialda bo'lsa — bu YOLG'ON ma'lumot.
    const ids = items.map((c) => c.id);
    const counts = ids.length
      ? await this.prisma.group.groupBy({
          by: ['courseId'],
          where: { ...branchFilter(), courseId: { in: ids }, isDeleted: false },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(counts.map((r) => [String(r.courseId), r._count._all]));

    return {
      items: items.map((c) => ({
        ...(withLegacyId(c) as Record<string, unknown>),
        groupCount: countMap.get(String(c.id)) || 0,
      })),
      total,
      page,
      limit,
    };
  }

  async getById(id: string) {
    const doc = await this.prisma.course.findUnique({
      where: { id },
      include: { leadDirection: { select: { id: true, name: true } } },
    });
    if (!doc) throw new ApiError(404, 'Kurs topilmadi');
    return withLegacyId(doc);
  }

  /**
   * ⚠ KOD KICHIK HARFGA TUSHIRILADI. Bu shunchaki tozalash emas —
   * `code` UNIQUE, ya'ni "IELTS" va "ielts" aks holda IKKI XIL kurs
   * bo'lib qolardi va hisobot ikkiga bo'linardi.
   */
  private normalizeCode(raw: unknown): string {
    return String(raw || '').trim().toLowerCase();
  }

  async create(body: CreateBody, currentUser?: AuthenticatedUser) {
    const title = String(body.title || '').trim();
    if (!title) throw new ApiError(400, 'Kurs nomi kerak');

    const code = this.normalizeCode(body.code);
    if (!code) throw new ApiError(400, 'Kurs kodi kerak');

    // Kod UNIKAL (model darajasida ham), lekin xatoni bu yerda ushlaymiz —
    // aks holda foydalanuvchi tushunarsiz P2002 ko'rardi.
    const clash = await this.prisma.course.findUnique({ where: { code } });
    if (clash) throw new ApiError(409, `"${code}" kodi allaqachon band`);

    const doc = await this.prisma.course.create({
      data: {
        title,
        code,
        level: String(body.level || '').trim(),
        defaultDurationMonths: body.defaultDurationMonths ?? null,
        leadDirectionId: body.leadDirection || null,
        createdById: currentUser?.id || currentUser?._id || null,
      },
    });
    return withLegacyId(doc);
  }

  async update(id: string, body: UpdateBody) {
    const doc = await this.getById(id);
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) throw new ApiError(400, 'Kurs nomi kerak');
      data.title = title;
    }

    if (body.code !== undefined) {
      const code = this.normalizeCode(body.code);
      if (!code) throw new ApiError(400, 'Kurs kodi kerak');
      if (code !== doc.code) {
        const clash = await this.prisma.course.findFirst({
          where: { code, id: { not: doc.id } },
        });
        if (clash) throw new ApiError(409, `"${code}" kodi allaqachon band`);
        data.code = code;
      }
    }

    if (body.level !== undefined) data.level = String(body.level || '').trim();
    if (body.defaultDurationMonths !== undefined) {
      data.defaultDurationMonths = body.defaultDurationMonths ?? null;
    }
    if (body.leadDirection !== undefined) {
      data.leadDirectionId = body.leadDirection || null;
    }
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    const updated = await this.prisma.course.update({ where: { id: doc.id }, data });
    return withLegacyId(updated);
  }

  /**
   * NOFAOL qilish (o'chirish EMAS).
   *
   * NEGA HARD DELETE YO'Q: kurs guruhlarga bog'langan va u yo'qolsa
   * hisobotdagi tarixiy qatorlar "kursi belgilanmagan" ga tushib
   * qolardi — ya'ni o'tgan yillar statistikasi JIMGINA o'zgarardi.
   *
   * ⚠ XONADAN FARQI: faol guruhlari bor kursni nofaol qilish MUMKIN
   * (xonada bu 400 beradi). Sabab: guruh xonasiz jadvaldan yo'qoladi,
   * kursi nofaol guruh esa o'z ishida davom etadi — u faqat YANGI
   * guruh yaratishda tanlanmaydi. Foydalanuvchiga nechta guruh
   * ta'sirlanishi AYTILADI.
   */
  async softRemove(id: string) {
    const doc = await this.getById(id);
    const activeGroups = await this.prisma.group.count({
      where: { courseId: doc.id, isActive: true, isDeleted: false },
    });

    const course = await this.prisma.course.update({
      where: { id: doc.id },
      data: { isActive: false },
    });
    return { course: withLegacyId(course), activeGroups };
  }
}

interface CreateBody {
  title: string;
  code: string;
  level?: string;
  defaultDurationMonths?: number | null;
  leadDirection?: string | null;
}

interface UpdateBody extends Partial<CreateBody> {
  isActive?: boolean;
}
