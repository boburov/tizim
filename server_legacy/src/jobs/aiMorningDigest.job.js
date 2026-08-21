import logger from "../config/logger.js";
import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";
import { runWithBranchContext } from "../helpers/branchContext.helper.js";
import { send as sendNotification } from "../modules/notifications/services/notifications.service.js";
import { localDayKey } from "../modules/ai/signals/pulse.signal.js";
import { fmtMoney } from "../modules/ai/services/insightWriter.service.js";

export const JOB_NAME = "daily.ai-morning-digest";

const MAX_ITEMS = 5;

const buildDigestBody = async (branchId) =>
  runWithBranchContext(
    {
      branchId: String(branchId),
      allowedBranchIds: [String(branchId)],
      canSeeAllBranches: false,
      userId: null,
    },
    async () => {
      const [high, opportunities, counts, report] = await Promise.all([
        prisma.insight.findMany({
          where: {
            branchId,
            status: { in: ["open", "acked"] },
            stance: { in: ["risk", "watch"] },
            severity: "high",
          },
          orderBy: { priority: "desc" },
          take: MAX_ITEMS,
          select: { title: true, subjectLabel: true, expectedImpactLabel: true, recommendedActions: true },
        }),
        prisma.insight.findMany({
          where: {
            branchId,
            status: { in: ["open", "acked"] },
            stance: "opportunity",
          },
          orderBy: { priority: "desc" },
          take: 2,
          select: { title: true, subjectLabel: true },
        }),
        prisma.insight.groupBy({
          by: ["severity", "stance"],
          where: { branchId, status: { in: ["open", "acked"] } },
          _count: { _all: true },
          _sum: { expectedImpactAmount: true },
        }),
        prisma.aiReport.findFirst({
          where: { branchId, period: "daily" },
          orderBy: { periodStart: "desc" },
          select: { summary: true, periodKey: true },
        }),
      ]);

      let highCount = 0;
      let mediumCount = 0;
      let oppCount = 0;
      let impact = 0;
      for (const r of counts) {
        if (r.stance === "opportunity") oppCount += r._count._all;
        else {
          if (r.severity === "high") highCount += r._count._all;
          if (r.severity === "medium") mediumCount += r._count._all;
          impact += r._sum.expectedImpactAmount || 0;
        }
      }

      if (highCount === 0 && mediumCount === 0 && oppCount === 0) return null;

      const lines = [];
      if (report?.summary) lines.push(report.summary, "");

      if (high.length) {
        lines.push("🔴 YUQORI USTUVORLIK");
        for (const i of high) {
          // JSON array dan birinchi actionni olish
          let actions = i.recommendedActions;
          if (typeof actions === 'string') {
              try { actions = JSON.parse(actions); } catch(e) { actions = []; }
          }
          if (!Array.isArray(actions)) actions = [];
          
          const action = actions?.[0]?.label;
          lines.push(`• ${i.title || i.subjectLabel}${action ? ` → ${action}` : ""}`);
        }
        if (highCount > high.length) {
          lines.push(`  …va yana ${highCount - high.length} ta`);
        }
        lines.push("");
      }

      if (mediumCount > 0) {
        lines.push(`🟡 O'RTA USTUVORLIK: ${mediumCount} ta vazifa`, "");
      }

      if (opportunities.length) {
        lines.push("🟢 IMKONIYATLAR");
        for (const i of opportunities) {
          lines.push(`• ${i.title || i.subjectLabel}`);
        }
        if (oppCount > opportunities.length) {
          lines.push(`  …va yana ${oppCount - opportunities.length} ta`);
        }
        lines.push("");
      }

      if (impact > 0) {
        lines.push(`Jami xavf ostidagi summa: ${fmtMoney(impact)} so'm.`);
      }

      return {
        body: lines.join("\n").trim(),
        counts: { high: highCount, medium: mediumCount, opportunities: oppCount },
      };
    },
  );

export default function defineAiMorningDigest(agenda) {
  agenda.define(JOB_NAME, async () => {
    const dayKey = localDayKey(new Date());

    const [branches, owners] = await Promise.all([
      prisma.branch.findMany({
        where: { isActive: true, isDeleted: false },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: { role: ROLES.OWNER, isActive: true, isDeleted: false },
        select: { id: true },
      }),
    ]);
    if (!owners.length || !branches.length) return;

    let sent = 0;
    for (const branch of branches) {
      try {
        const digest = await buildDigestBody(branch.id);
        if (!digest) continue;

        await sendNotification(
          {
            title: `AI kunlik xulosa — ${branch.name}`,
            body: digest.body,
            category: "other",
            audience: { type: "auto_system", userIds: owners.map((o) => o.id) },
            isAuto: true,
            dedupeKey: `ai-digest:${branch.id}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        logger.warn({ err, branch: branch.name }, "AI digest yuborilmadi");
      }
    }

    logger.info({ branches: branches.length, sent }, "AI ertalabki digest");
  });
}
