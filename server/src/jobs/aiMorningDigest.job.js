import logger from "../config/logger.js";
import User from "../models/user.model.js";
import Branch from "../models/branch.model.js";
import AiReport from "../models/aiReport.model.js";
import Insight from "../models/insight.model.js";
import { ROLES } from "../constants/roles.js";
import { runWithBranchContext } from "../helpers/branchContext.helper.js";
import { send as sendNotification } from "../modules/notifications/services/notifications.service.js";
import { localDayKey } from "../modules/ai/signals/pulse.signal.js";
import { fmtMoney } from "../modules/ai/services/insightWriter.service.js";

export const JOB_NAME = "daily.ai-morning-digest";

// ERTALABKI DIGEST - "egasi ertalab ochib, darhol nima e'tibor talab
// qilishini ko'rsin" talabining eng kuchli shakli: u ILOVANI OCHMASDAN
// ham ko'radi.
//
// NEGA MUHIM: proaktiv tizim faqat foydalanuvchi kirganda ishlaydigan
// tizim emas. Insight tunda yaratiladi, lekin owner uni faqat sahifani
// ochsa ko'radi - va ochmasa, tizim "passiv" bo'lib qoladi. Bildirishnoma
// bu halqani yopadi.
//
// DEDUPE: `dedupeKey` kunlik kalit bilan - job qayta ishga tushsa
// (restart/retry) owner ikkita bir xil xabar olmaydi. Bu kodbazadagi
// lowAttendanceDigest naqshining aynan o'zi.

// Xabarda ko'rsatiladigan vazifa soni. Telegram/push xabari o'qiladigan
// bo'lib qolishi kerak - to'liq ro'yxat ilovada.
const MAX_ITEMS = 5;

/** Bitta filial uchun digest matnini quradi. */
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
        Insight.find({
          branchId,
          status: { $in: ["open", "acked"] },
          stance: { $in: ["risk", "watch"] },
          severity: "high",
        })
          .sort({ priority: -1 })
          .limit(MAX_ITEMS)
          .select("title subjectLabel expectedImpact.label recommendedActions")
          .lean(),
        Insight.find({
          branchId,
          status: { $in: ["open", "acked"] },
          stance: "opportunity",
        })
          .sort({ priority: -1 })
          .limit(2)
          .select("title subjectLabel")
          .lean(),
        Insight.aggregate([
          { $match: { branchId, status: { $in: ["open", "acked"] } } },
          {
            $group: {
              _id: { severity: "$severity", stance: "$stance" },
              count: { $sum: 1 },
              impact: { $sum: "$expectedImpact.amount" },
            },
          },
        ]),
        AiReport.findOne({ branchId, period: "daily" })
          .sort({ periodStart: -1 })
          .select("summary periodKey")
          .lean(),
      ]);

      let highCount = 0;
      let mediumCount = 0;
      let oppCount = 0;
      let impact = 0;
      for (const r of counts) {
        if (r._id.stance === "opportunity") oppCount += r.count;
        else {
          if (r._id.severity === "high") highCount += r.count;
          if (r._id.severity === "medium") mediumCount += r.count;
          impact += r.impact || 0;
        }
      }

      // Hech narsa yo'q bo'lsa xabar YUBORILMAYDI. "Bugun muammo yo'q"
      // xabari har kuni kelsa, owner digestni o'qishni butunlay to'xtatadi
      // va haqiqiy ogohlantirishni ham o'tkazib yuboradi.
      if (highCount === 0 && mediumCount === 0 && oppCount === 0) return null;

      const lines = [];
      if (report?.summary) lines.push(report.summary, "");

      if (high.length) {
        lines.push("🔴 YUQORI USTUVORLIK");
        for (const i of high) {
          const action = i.recommendedActions?.[0]?.label;
          lines.push(`• ${i.title || i.subjectLabel}${action ? ` → ${action}` : ""}`);
        }
        if (highCount > high.length) {
          // CHEGARA OCHIQ AYTILADI - aks holda owner ro'yxatni to'liq deb o'ylaydi.
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

/**
 * ERTALABKI DIGEST.
 *
 * VAQTI: 08:00 - tungi hisoblash (01:00) va kunlik hisobot (07:00) dan
 * KEYIN. Aks holda digest kechagi insight'lar va mavjud bo'lmagan
 * hisobotga havola qilardi.
 */
export default function defineAiMorningDigest(agenda) {
  agenda.define(JOB_NAME, async () => {
    const dayKey = localDayKey(new Date());

    const [branches, owners] = await Promise.all([
      Branch.find({ isActive: true, isDeleted: { $ne: true } })
        .select("_id name")
        .lean(),
      User.find({ role: ROLES.OWNER, isActive: true, isDeleted: { $ne: true } })
        .select("_id")
        .lean(),
    ]);
    if (!owners.length || !branches.length) return;

    let sent = 0;
    for (const branch of branches) {
      try {
        const digest = await buildDigestBody(branch._id);
        if (!digest) continue;

        await sendNotification(
          {
            title: `AI kunlik xulosa — ${branch.name}`,
            body: digest.body,
            // "other": NOTIFICATION_CATEGORIES ro'yxatida AI/tizim xulosasi
            // uchun maxsus kategoriya yo'q. "announcement" e'lon degan
            // ma'noni beradi (o'quvchilarga qaratilgan) va owner digestini
            // u yerga qo'yish kategoriya bo'yicha filtrlarni chalg'itardi.
            category: "other",
            audience: { type: "auto_system", userIds: owners.map((o) => o._id) },
            isAuto: true,
            dedupeKey: `ai-digest:${branch._id}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        // Bitta filial xatosi qolganini to'xtatmaydi.
        logger.warn({ err, branch: branch.name }, "AI digest yuborilmadi");
      }
    }

    logger.info({ branches: branches.length, sent }, "AI ertalabki digest");
  });
}
