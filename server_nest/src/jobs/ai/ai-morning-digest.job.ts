import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES } from '../../common/constants/permissions.js';
import { runWithBranchContext } from '../../common/als/branch-context.js';
import { NotificationsService } from '../../modules/notifications/notifications.service.js';
import { localDayKey } from '../../modules/ai/signals/pulse.signal.js';
import { fmtMoney } from '../../modules/ai/insight-writer.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `daily.ai-morning-digest` — `server/src/jobs/aiMorningDigest.job.js`.
 *
 * PROAKTIVLIK HALQASINI YOPADI: owner ilovani ochmasa ham ko'radi.
 * 08:00 da, kunlik hisobotdan (07:00) KEYIN.
 *
 * ── ⚠ HAR FILIAL O'Z KONTEKSTIDA ──
 * `runWithBranchContext` HAR filial uchun alohida o'raladi. Usiz ALS
 * bo'sh bo'lardi (job HTTP so'rovidan ajralgan) va `branchFilter()`
 * bo'sh filtr qaytarib, digest BARCHA filiallarni aralashtirib
 * yuborardi.
 *
 * ── ⚠ DEDUPE KALITI ──
 * `ai-digest:<branchId>:<kun>` — job ikki marta yursa (retry, ikkinchi
 * worker) owner IKKI XIL bir xil xabar olardi. Kun kaliti MAHALLIY
 * vaqt bo'yicha.
 *
 * ── ⚠ BITTA FILIAL XATOSI QOLGANINI TO'XTATMAYDI ──
 * `try/catch` sikl ICHIDA: bitta filialdagi buzuq ma'lumot butun
 * markazni digestsiz qoldirardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const MAX_ITEMS = 5;

@Injectable()
export class AiMorningDigestJob implements JobDefinition {
  readonly name = 'daily.ai-morning-digest';
  /** Express: `every("0 8 * * *", AI_DIGEST_JOB)`. */
  readonly cron = '0 8 * * *';

  private readonly logger = new Logger('Job:ai-morning-digest');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private buildDigestBody(branchId: string) {
    return runWithBranchContext(
      {
        branchId: String(branchId),
        allowedBranchIds: [String(branchId)],
        canSeeAllBranches: false,
        userId: null,
      },
      async () => {
        const [high, opportunities, counts, report] = await Promise.all([
          this.prisma.insight.findMany({
            where: {
              branchId,
              status: { in: ['open', 'acked'] as never },
              stance: { in: ['risk', 'watch'] as never },
              severity: 'high',
            },
            orderBy: { priority: 'desc' },
            take: MAX_ITEMS,
            select: {
              title: true, subjectLabel: true,
              expectedImpactLabel: true, recommendedActions: true,
            },
          }),
          this.prisma.insight.findMany({
            where: {
              branchId,
              status: { in: ['open', 'acked'] as never },
              stance: 'opportunity',
            },
            orderBy: { priority: 'desc' },
            take: 2,
            select: { title: true, subjectLabel: true },
          }),
          this.prisma.insight.groupBy({
            by: ['severity', 'stance'],
            where: { branchId, status: { in: ['open', 'acked'] as never } },
            _count: { _all: true },
            _sum: { expectedImpactAmount: true },
          }),
          this.prisma.aiReport.findFirst({
            where: { branchId, period: 'daily' },
            orderBy: { periodStart: 'desc' },
            select: { summary: true, periodKey: true },
          }),
        ]);

        let highCount = 0;
        let mediumCount = 0;
        let oppCount = 0;
        let impact = 0;
        for (const r of counts as any[]) {
          if (r.stance === 'opportunity') oppCount += r._count._all;
          else {
            if (r.severity === 'high') highCount += r._count._all;
            if (r.severity === 'medium') mediumCount += r._count._all;
            impact += Number(r._sum.expectedImpactAmount) || 0;
          }
        }

        if (highCount === 0 && mediumCount === 0 && oppCount === 0) return null;

        const lines: string[] = [];
        if (report?.summary) lines.push(report.summary, '');

        if (high.length) {
          lines.push('🔴 YUQORI USTUVORLIK');
          for (const i of high as any[]) {
            // JSON massivdan BIRINCHI harakatni olamiz.
            let actions = i.recommendedActions;
            if (typeof actions === 'string') {
              try { actions = JSON.parse(actions); } catch { actions = []; }
            }
            if (!Array.isArray(actions)) actions = [];

            const action = actions?.[0]?.label;
            lines.push(`• ${i.title || i.subjectLabel}${action ? ` → ${action}` : ''}`);
          }
          if (highCount > high.length) {
            lines.push(`  …va yana ${highCount - high.length} ta`);
          }
          lines.push('');
        }

        if (mediumCount > 0) {
          lines.push(`🟡 O'RTA USTUVORLIK: ${mediumCount} ta vazifa`, '');
        }

        if (opportunities.length) {
          lines.push('🟢 IMKONIYATLAR');
          for (const i of opportunities as any[]) {
            lines.push(`• ${i.title || i.subjectLabel}`);
          }
          if (oppCount > opportunities.length) {
            lines.push(`  …va yana ${oppCount - opportunities.length} ta`);
          }
          lines.push('');
        }

        if (impact > 0) {
          lines.push(`Jami xavf ostidagi summa: ${fmtMoney(impact)} so'm.`);
        }

        return {
          body: lines.join('\n').trim(),
          counts: { high: highCount, medium: mediumCount, opportunities: oppCount },
        };
      },
    );
  }

  async run(): Promise<void> {
    const dayKey = localDayKey(new Date());

    const [branches, owners] = await Promise.all([
      this.prisma.branch.findMany({
        where: { isActive: true, isDeleted: false },
        select: { id: true, name: true },
      }),
      this.prisma.user.findMany({
        where: { role: ROLES.OWNER, isActive: true, isDeleted: false },
        select: { id: true },
      }),
    ]);
    if (!owners.length || !branches.length) return;

    let sent = 0;
    for (const branch of branches) {
      try {
        const digest = await this.buildDigestBody(branch.id);
        if (!digest) continue;

        await this.notifications.send(
          {
            title: `AI kunlik xulosa — ${branch.name}`,
            body: digest.body,
            category: 'other',
            audience: { type: 'auto_system', userIds: owners.map((o) => o.id) },
            isAuto: true,
            dedupeKey: `ai-digest:${branch.id}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `AI digest yuborilmadi (${branch.name}): ${(err as Error)?.message}`,
        );
      }
    }

    this.logger.log(`AI ertalabki digest — filiallar: ${branches.length}, yuborildi: ${sent}`);
  }
}
