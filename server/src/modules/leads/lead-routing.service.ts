import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID YO'NALTIRISH — `services/leadRouting.service.js` EKVIVALENTI.
 *
 * ══════════════════════════════════════════════════════════════════
 * YECHIM TARTIBI (BIRINCHI MOS KELGAN YUTADI) — O'ZGARTIRILMASIN
 * ══════════════════════════════════════════════════════════════════
 *   1. Manba bo'yicha ANIQ qoida  (`priority` bo'yicha, KICHIGI ustun)
 *   2. ZAXIRA qoida               (`isFallback`)
 *   3. ASOSIY FILIAL              (oxirgi chora — lid yo'qolmasin)
 *
 * ⚠ 3-QADAM ATAYLAB MAVJUD: qoida umuman sozlanmagan markazda ham lid
 * biror ro'yxatga TUSHISHI kerak. Aks holda tizim ishga tushgan
 * birinchi kuni barcha lid "yo'q joyga" ketardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class LeadRoutingService {
  private readonly logger = new Logger('LeadRouting');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BranchAccessService) private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * Manba kalitini normallashtiradi.
   *
   * ⚠ `source` LeadOption ID'si ham, ERKIN MATN ham bo'lishi mumkin
   * (bot to'g'ridan-to'g'ri "telegram_chilonzor" yuborishi mumkin).
   * Ikkalasini BITTA kalitga keltiramiz — aks holda qoida bir holatda
   * ishlab, ikkinchisida JIMGINA o'tkazib yuborilardi.
   */
  async resolveSourceKey(source?: string | null): Promise<string | null> {
    if (!source) return null;
    const raw = String(source).trim();
    if (!raw) return null;

    // Kalit 24-hex ko'rinishida bo'lsa — LeadOption ID'si bo'lishi mumkin.
    if (/^[0-9a-fA-F]{24}$/.test(raw)) {
      const opt = await this.prisma.leadOption.findUnique({
        where: { id: raw },
        select: { name: true },
      });
      if (opt?.name) return opt.name.trim().toLowerCase();
    }
    return raw.toLowerCase();
  }

  /**
   * LIDNI QAYSI FILIALGA YO'NALTIRISH.
   *
   * `matchedBy`: "source" | "fallback" | "main_branch"
   */
  async route({ source }: { source?: string | null } = {}): Promise<{
    branchId: string;
    assigneeId: string | null;
    matchedBy: string;
    ruleId: string | null;
  }> {
    const sourceKey = await this.resolveSourceKey(source);

    // 1) MANBA BO'YICHA ANIQ QOIDA.
    if (sourceKey) {
      const rule = await this.prisma.leadRoutingRule.findFirst({
        where: { sourceKey, isActive: true },
        // ⚠ `priority: asc` — KICHIK raqam USTUN. Teng bo'lsa eskisi
        // yutadi (`createdAt: asc`), ya'ni natija BARQAROR.
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });

      if (rule) {
        return {
          branchId: rule.branchId,
          assigneeId: rule.assigneeId || null,
          matchedBy: 'source',
          ruleId: rule.id,
        };
      }
    }

    // 2) ZAXIRA QOIDA.
    const fallback = await this.prisma.leadRoutingRule.findFirst({
      where: { isFallback: true, isActive: true },
    });

    if (fallback) {
      return {
        branchId: fallback.branchId,
        assigneeId: fallback.assigneeId || null,
        matchedBy: 'fallback',
        ruleId: fallback.id,
      };
    }

    // 3) ASOSIY FILIAL — OXIRGI CHORA.
    //
    // Bu yerga yetib kelish "qoidalar sozlanmagan" degani, XATO EMAS.
    // Lekin logga yoziladi: owner ko'rib, qoida qo'shishi kerak.
    const main = await this.branchAccess.ensureMainBranch();
    if (!main?.id) {
      throw new ApiError(400, "Lid uchun filial aniqlanmadi - avval filial oching");
    }

    this.logger.warn(
      `Lid yo'naltirish qoidasi topilmadi — asosiy filialga yuborildi (sourceKey=${sourceKey})`,
    );

    return {
      // ⚠ `main.id`, `main._id` EMAS. `ensureMainBranch()` XOM Prisma
      // natijasini qaytaradi va `_id` taxallusi faqat JAVOB chegarasida
      // qo'shiladi. Ko'chirishda bu qator bir marta `_id` bo'lib qolgan
      // va `branchId: undefined` chiqib, lid yaratish YIQILGAN edi —
      // ya'ni "lid hech qachon yo'qolmaydi" invarianti aynan zaxira
      // yo'lida buzilgan edi.
      branchId: main.id,
      assigneeId: null,
      matchedBy: 'main_branch',
      ruleId: null,
    };
  }

  // ═══════════════════ QOIDALARNI BOSHQARISH ═══════════════════

  async list() {
    const rules = await this.prisma.leadRoutingRule.findMany({
      orderBy: [{ isFallback: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        branch: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // ⚠ KLIENT ESKI POPULATE SHAKLINI KUTADI: `branchId`/`assigneeId`
    // OBYEKT bo'lib qaytadi, satr emas.
    return rules.map((r) => ({
      ...(withLegacyId(r) as Record<string, unknown>),
      branchId: r.branch ? withLegacyId(r.branch) : null,
      assigneeId: r.assignee ? withLegacyId(r.assignee) : null,
    }));
  }

  async create(body: Record<string, any>) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: String(body.branchId), isDeleted: false },
      select: { id: true },
    });
    if (!branch) throw new ApiError(400, 'Filial topilmadi');

    const isFallback = Boolean(body.isFallback);
    const sourceKey = isFallback
      ? null
      : String(body.sourceKey || '').trim().toLowerCase() || null;

    try {
      // ⚠ Mongo'da bu model `pre("validate")` hook'i edi. Prisma'da
      // model hook'i YO'Q, shuning uchun shu yerda OCHIQ takrorlanadi.
      if (!isFallback && !sourceKey) {
        throw new ApiError(400, "Qoida uchun manba kerak (yoki uni zaxira qiling)");
      }
      if (isFallback && sourceKey) {
        throw new ApiError(400, "Zaxira qoidada manba bo'lmaydi - u hammaga qo'llanadi");
      }

      const created = await this.prisma.leadRoutingRule.create({
        data: {
          branchId: body.branchId ? String(body.branchId) : null,
          sourceKey,
          isFallback,
          assigneeId: body.assigneeId || null,
          priority: body.priority ?? 100,
          note: String(body.note || '').trim(),
        } as never,
      });
      return withLegacyId(created);
    } catch (err: any) {
      // ⚠ Qisman unique indekslar: P2002 → 409, xabar holatga qarab.
      if (err?.code === 'P2002') {
        throw new ApiError(
          409,
          isFallback
            ? 'Zaxira qoida allaqachon mavjud - faqat bittasi bo\'lishi mumkin'
            : 'Bu manba uchun shu filialda qoida allaqachon bor',
        );
      }
      throw err;
    }
  }

  async update(id: string, body: Record<string, any>) {
    const rule = await this.prisma.leadRoutingRule.findUnique({ where: { id } });
    if (!rule) throw new ApiError(404, 'Qoida topilmadi');

    const data: Record<string, any> = {};
    if (body.branchId !== undefined) data.branchId = body.branchId ? String(body.branchId) : null;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.note !== undefined) data.note = String(body.note || '').trim();

    const updated = await this.prisma.leadRoutingRule.update({ where: { id }, data });
    return withLegacyId(updated);
  }

  async remove(id: string) {
    const rule = await this.prisma.leadRoutingRule.findUnique({ where: { id } });
    if (!rule) throw new ApiError(404, 'Qoida topilmadi');
    await this.prisma.leadRoutingRule.delete({ where: { id } });
    return withLegacyId(rule);
  }
}
