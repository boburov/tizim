import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StudentInsightService } from './student-insight.service.js';
import { TeacherInsightService } from './teacher-insight.service.js';
import { GroupInsightService } from './group-insight.service.js';
import { CourseInsightService } from './course-insight.service.js';
import { LeadInsightService } from './lead-insight.service.js';
import { FinanceInsightService } from './finance-insight.service.js';
import { RankingService } from './ranking.service.js';

import { AI_ENGINE_VERSION } from './ai.constants.js';
import {
  runWithBranchContext,
  branchFilter,
} from "../../common/als/branch-context.js";

/** QAYTA HISOBLASH DIRIJYORI — `services/recompute.service.js` ning ko'chirmasi. */
const FULL_PIPELINE = ["students", "groups", "courses", "leads", "finance", "rankings"];

// TEZ (fast) rejim - kunduzi har 3 soatda ishlaydigan qism.
//
// Faqat kun ichida O'ZGARADIGAN narsalar: qarz holati, issiq lidlar,
// o'qituvchi bugun kelmagani. Og'ir trend aggregation'lari (churn, kurs
// foydaliligi, guruh medianasi) kiritilmaydi: ular 4 haftalik oynaga
// tayanadi va kun ichida amalda o'zgarmaydi, lekin hisoblashi eng qimmat.
// Shu bo'linish tufayli "har necha soatda yangilanadi" talabi arzon.
const FAST_PIPELINE = ["leads", "teachers", "finance"];

export { FULL_PIPELINE, FAST_PIPELINE };

@Injectable()
export class RecomputeService {
  private readonly logger = new Logger('AiRecompute');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly studentInsights: StudentInsightService,
    private readonly teacherInsights: TeacherInsightService,
    private readonly groupInsights: GroupInsightService,
    private readonly courseInsights: CourseInsightService,
    private readonly leadInsights: LeadInsightService,
    private readonly financeInsights: FinanceInsightService,
    private readonly rankings: RankingService,
  ) {}

  private get RUNNERS(): any {
    return {
  students: async (branchId: any,now: any) => ({
    students: await this.studentInsights.recomputeStudentInsights(branchId, now),
  }),
  teachers: async (branchId: any,now: any) => ({
    teachers: await this.teacherInsights.recomputeTeacherInsights(branchId, now),
  }),
  groups: async (branchId: any,now: any) => ({
    groups: await this.groupInsights.recomputeGroupInsights(branchId, now),
  }),
  leads: async (branchId: any,now: any) => ({
    leads: await this.leadInsights.recomputeLeadInsights(branchId, now),
  }),
  finance: async (branchId: any,now: any) => ({
    finance: await this.financeInsights.recomputeFinanceInsights(branchId, now),
  }),
  // Reytinglar insight EMAS - ular chegara qo'llamaydi va AiRanking
  // snapshotiga yoziladi. Shuning uchun this.openCounts() ga ta'sir qilmaydi
  // va o'z statistikasini qaytaradi.
  rankings: async (branchId: any) => ({
    rankings: await this.rankings.recomputeRankings(branchId),
  }),
};
  }
  /**
   * Ochiq insight kesimi - UI shu sonlarni ko'rsatadi.
   *
   * MUHIM: branch kontekstI ICHIDA chaqirilishi kerak (branchFilter()
   * shundan o'qiydi). Imkoniyatlar xavflardan ALOHIDA sanaladi - ularni
   * "yuqori ustuvorlik" hisobiga qo'shish owner'ga 12 ta muammo bor deb
   * ko'rsatardi, holbuki 4 tasi o'sish taklifi.
   */
  async openCounts() {
  // Guruhlash IKKI ustun bo'yicha - `insights` jadvalining O'Z
  // ustunlari, ya'ni `groupBy` yetarli (raw SQL kerak emas).
  // `expectedImpact.amount` Mongo'da ichma-ich obyekt edi; Prisma'da
  // tekis ustun: `expectedImpactAmount`.
  const rows = await this.prisma.insight.groupBy({
    by: ["severity", "stance"],
    where: { ...branchFilter(), status: { in: ["open", "acked"] } },
    _count: { _all: true },
    _sum: { expectedImpactAmount: true },
  });

  const out = { high: 0, medium: 0, low: 0, opportunities: 0, impactAtRisk: 0, upside: 0 };
  for (const r of rows) {
    const count = r._count._all;
    const impact = Number(r._sum.expectedImpactAmount) || 0;
    if (r.stance === "opportunity") {
      out.opportunities += count;
      out.upside += impact;
    } else {
      out[r.severity] = (out[r.severity] || 0) + count;
      out.impactAtRisk += impact;
    }
  }
  return out;
}

  /**
   * Bitta filialni qayta hisoblaydi (o'z kontekstida) va natijani AiRun ga yozadi.
   *
   * AiRun yozuvi shunchaki jurnal emas - u UI da "AI oxirgi marta 07:12 da
   * tahlil qildi" qatorini ta'minlaydi. Bu qator bo'lmasa dashboard yana
   * bir statik sahifa bo'lib qoladi va bir hafta ichida e'tiborsiz qolinadi.
   *
   * @param {string} branchId
   * @param {{scope?: "full"|"fast", trigger?: "nightly"|"intraday"|"manual", now?: Date}} opts
   */
  async recomputeBranch(
  branchId: any,
  { scope = "full", trigger = "manual", now = new Date() } = {},
) {
  const run: any = await this.prisma.aiRun.create({
    data: {
      branchId: String(branchId),
      trigger: trigger as never,
      scope: scope as never,
      status: "running",
      startedAt: new Date(),
      engineVersion: AI_ENGINE_VERSION,
    },
  });

  try {
    const result = await runWithBranchContext(
      {
        branchId: String(branchId),
        allowedBranchIds: [String(branchId)],
        canSeeAllBranches: false,
        userId: null,
      },
      async () => {
        const stats: any = {};
        const pipeline = scope === "fast" ? FAST_PIPELINE : FULL_PIPELINE;

        for (const step of pipeline) {
          if (step === "groups") {
            // Guruh va o'qituvchi bosqichlari birga: ikkalasi ham guruh
            // ro'yxatiga tayanadi va tartibi barqaror bo'lishi kerak.
            Object.assign(stats, await this.RUNNERS.groups(branchId, now));
            Object.assign(stats, await this.RUNNERS.teachers(branchId, now));
            continue;
          }
          if (step === "courses") {
            // Guruh bosqichi natijasini QAYTA ISHLATADI - guruh ro'yxati va
            // medianani ikkinchi marta hisoblash keraksiz DB yuklamasi.
            const gs = stats.groups?.signals;
            stats.courses = await this.courseInsights.recomputeCourseInsights(branchId, now, {
              groups: gs?.groups || null,
              medianGroupSize: gs?.size?.medianSize || 0,
            });
            continue;
          }
          Object.assign(stats, await this.RUNNERS[step](branchId, now));
        }

        // Guruh signallari (Map'lar va to'liq hujjatlar bilan) AiRun ga
        // yozilmasligi kerak: ular ichki ma'lumot, Mixed maydonda esa
        // foydasiz shovqin va o'nlab kilobayt joy.
        if (stats.groups?.signals) delete stats.groups.signals;
        if (stats.finance) {
          delete stats.finance.forecastSnapshot;
          delete stats.finance.overdueSnapshot;
        }

        return { stats, counts: await this.openCounts() };
      },
    );

    // MONGO'DA BU `run.save()` EDI. Prisma'da hujjat obyekti yo'q -
    // faqat o'zgargan maydonlar yoziladi.
    const finishedAt: any = new Date();
    await this.prisma.aiRun.update({
      where: { id: run.id },
      data: {
        status: "ok",
        finishedAt,
        durationMs: finishedAt - run.startedAt,
        stats: result.stats,
        openHigh: result.counts.high,
        openMedium: result.counts.medium,
        openOpportunities: result.counts.opportunities,
      },
    });

    return { branchId: String(branchId), runId: String(run.id), ...result };
  } catch (err) {
    // Xato ham YOZILADI: jimgina yiqilgan job eng yomon holat - ochiq
    // insight'lar eskiradi, lekin UI da hammasi yaxshi ko'rinadi.
    const failedAt: any = new Date();
    await this.prisma.aiRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: failedAt,
        durationMs: failedAt - run.startedAt,
        error: String((err as Error)?.message || err).slice(0, 500),
      },
    });
    throw err;
  }
}

  /**
   * Barcha faol filiallarni KETMA-KET qayta hisoblaydi.
   *
   * KETMA-KET, parallel emas: 500 o'quvchilik filial o'nlab og'ir
   * aggregation qiladi va ularni bir vaqtda ishga tushirish tungi soatlarda
   * ham Mongo'ni bo'g'ib qo'yishi mumkin. Tezlik bu yerda muhim emas -
   * natijani hech kim kutib turmaydi.
   */
  async recomputeAll({
  scope = "full",
  trigger = "nightly",
  now = new Date(),
} = {}) {
  const branches = await this.prisma.branch.findMany({
    where: { isActive: true, isDeleted: false },
    // `id` ATAYLAB: `this.recomputeBranch(b.id, ...)` uchun kerak.
    select: { id: true, name: true },
  });

  const results = [];
  for (const b of (branches) as any[]) {
    try {
      const r = await this.recomputeBranch(b.id, { scope, trigger, now });
      results.push({ ...r, name: b.name });
      this.logger.log({ branch: b.name, scope, counts: r.counts }, "AI qayta hisoblash tayyor");
    } catch (err) {
      // Bitta filial xatosi qolganini to'xtatmaydi - aks holda bitta
      // filialdagi buzuq ma'lumot butun markazni AI'siz qoldirardi.
      this.logger.error({ err, branch: b.name }, "AI qayta hisoblash xato");
      results.push({ branchId: String(b.id), name: b.name, error: (err as Error).message });
    }
  }
  return results;
}
}