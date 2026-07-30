import Branch from "../../../models/branch.model.js";
import Insight from "../../../models/insight.model.js";
import AiRun from "../../../models/aiRun.model.js";
import { AI_ENGINE_VERSION } from "../../../models/aiConfig.model.js";
import logger from "../../../config/logger.js";
import {
  runWithBranchContext,
  branchFilter,
} from "../../../helpers/branchContext.helper.js";
import { recomputeStudentInsights } from "./studentInsight.service.js";
import { recomputeTeacherInsights } from "./teacherInsight.service.js";
import { recomputeGroupInsights } from "./groupInsight.service.js";
import { recomputeCourseInsights } from "./courseInsight.service.js";
import { recomputeLeadInsights } from "./leadInsight.service.js";
import { recomputeFinanceInsights } from "./financeInsight.service.js";

// QAYTA HISOBLASH ORKESTRATORI - "AI o'zi kuzatib turadi" da'vosining
// haqiqiy dvigateli. Foydalanuvchi hech narsa so'ramaydi: bu job kechasi
// va kunduzi o'zi ishlaydi, o'zi insight yaratadi, o'zi eskirganini yopadi.
//
// Har bir filial O'Z branch kontekstida ishlaydi. Bu "chiroyli bo'lsin"
// uchun emas: branchMatchStage() AsyncLocalStorage'dan o'qiydi, va
// kontekstsiz ishga tushirilsa filtr BO'SH qaytadi va barcha filiallar
// ma'lumoti aralashadi. Job kontekstni ochiq o'rnatishi SHART.

/**
 * DETEKTOR TARTIBI - ATAYLAB shunday. O'zgartirishdan oldin o'qing:
 *
 *   1. students          - churn ballari keyingi bosqichlar uchun KIRISH
 *   2. groups + teachers - guruh ro'yxati va filial medianasini hisoblaydi
 *   3. courses           - guruh ro'yxati va medianani QAYTA ISHLATADI (2 dan)
 *   4. leads             - mustaqil
 *   5. finance           - churn ballarini O'QIYDI (1 dan), shuning uchun OXIRIDA
 *
 * Agar moliya o'quvchidan oldin ishlasa, daromad bashorati KECHAGI churn
 * ballariga tayanadi va har kuni bir kun orqada qolgan son ko'rsatadi.
 */
const FULL_PIPELINE = ["students", "groups", "courses", "leads", "finance"];

// TEZ (fast) rejim - kunduzi har 3 soatda ishlaydigan qism.
//
// Faqat kun ichida O'ZGARADIGAN narsalar: qarz holati, issiq lidlar,
// o'qituvchi bugun kelmagani. Og'ir trend aggregation'lari (churn, kurs
// foydaliligi, guruh medianasi) kiritilmaydi: ular 4 haftalik oynaga
// tayanadi va kun ichida amalda o'zgarmaydi, lekin hisoblashi eng qimmat.
// Shu bo'linish tufayli "har necha soatda yangilanadi" talabi arzon.
const FAST_PIPELINE = ["leads", "teachers", "finance"];

const RUNNERS = {
  students: async (branchId, now) => ({
    students: await recomputeStudentInsights(branchId, now),
  }),
  teachers: async (branchId, now) => ({
    teachers: await recomputeTeacherInsights(branchId, now),
  }),
  groups: async (branchId, now) => ({
    groups: await recomputeGroupInsights(branchId, now),
  }),
  leads: async (branchId, now) => ({
    leads: await recomputeLeadInsights(branchId, now),
  }),
  finance: async (branchId, now) => ({
    finance: await recomputeFinanceInsights(branchId, now),
  }),
};

/**
 * Ochiq insight kesimi - UI shu sonlarni ko'rsatadi.
 *
 * MUHIM: branch kontekstI ICHIDA chaqirilishi kerak (branchFilter()
 * shundan o'qiydi). Imkoniyatlar xavflardan ALOHIDA sanaladi - ularni
 * "yuqori ustuvorlik" hisobiga qo'shish owner'ga 12 ta muammo bor deb
 * ko'rsatardi, holbuki 4 tasi o'sish taklifi.
 */
export const openCounts = async () => {
  const rows = await Insight.aggregate([
    { $match: { ...branchFilter(), status: { $in: ["open", "acked"] } } },
    {
      $group: {
        _id: { severity: "$severity", stance: "$stance" },
        count: { $sum: 1 },
        impact: { $sum: "$expectedImpact.amount" },
      },
    },
  ]);

  const out = { high: 0, medium: 0, low: 0, opportunities: 0, impactAtRisk: 0, upside: 0 };
  for (const r of rows) {
    if (r._id.stance === "opportunity") {
      out.opportunities += r.count;
      out.upside += r.impact || 0;
    } else {
      out[r._id.severity] = (out[r._id.severity] || 0) + r.count;
      out.impactAtRisk += r.impact || 0;
    }
  }
  return out;
};

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
export const recomputeBranch = async (
  branchId,
  { scope = "full", trigger = "manual", now = new Date() } = {},
) => {
  const run = await AiRun.create({
    branchId,
    trigger,
    scope,
    status: "running",
    startedAt: new Date(),
    engineVersion: AI_ENGINE_VERSION,
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
        const stats = {};
        const pipeline = scope === "fast" ? FAST_PIPELINE : FULL_PIPELINE;

        for (const step of pipeline) {
          if (step === "groups") {
            // Guruh va o'qituvchi bosqichlari birga: ikkalasi ham guruh
            // ro'yxatiga tayanadi va tartibi barqaror bo'lishi kerak.
            Object.assign(stats, await RUNNERS.groups(branchId, now));
            Object.assign(stats, await RUNNERS.teachers(branchId, now));
            continue;
          }
          if (step === "courses") {
            // Guruh bosqichi natijasini QAYTA ISHLATADI - guruh ro'yxati va
            // medianani ikkinchi marta hisoblash keraksiz DB yuklamasi.
            const gs = stats.groups?.signals;
            stats.courses = await recomputeCourseInsights(branchId, now, {
              groups: gs?.groups || null,
              medianGroupSize: gs?.size?.medianSize || 0,
            });
            continue;
          }
          Object.assign(stats, await RUNNERS[step](branchId, now));
        }

        // Guruh signallari (Map'lar va to'liq hujjatlar bilan) AiRun ga
        // yozilmasligi kerak: ular ichki ma'lumot, Mixed maydonda esa
        // foydasiz shovqin va o'nlab kilobayt joy.
        if (stats.groups?.signals) delete stats.groups.signals;
        if (stats.finance) {
          delete stats.finance.forecastSnapshot;
          delete stats.finance.overdueSnapshot;
        }

        return { stats, counts: await openCounts() };
      },
    );

    run.status = "ok";
    run.finishedAt = new Date();
    run.durationMs = run.finishedAt - run.startedAt;
    run.stats = result.stats;
    run.openHigh = result.counts.high;
    run.openMedium = result.counts.medium;
    run.openOpportunities = result.counts.opportunities;
    await run.save();

    return { branchId: String(branchId), runId: String(run._id), ...result };
  } catch (err) {
    // Xato ham YOZILADI: jimgina yiqilgan job eng yomon holat - ochiq
    // insight'lar eskiradi, lekin UI da hammasi yaxshi ko'rinadi.
    run.status = "failed";
    run.finishedAt = new Date();
    run.durationMs = run.finishedAt - run.startedAt;
    run.error = String(err?.message || err).slice(0, 500);
    await run.save();
    throw err;
  }
};

/**
 * Barcha faol filiallarni KETMA-KET qayta hisoblaydi.
 *
 * KETMA-KET, parallel emas: 500 o'quvchilik filial o'nlab og'ir
 * aggregation qiladi va ularni bir vaqtda ishga tushirish tungi soatlarda
 * ham Mongo'ni bo'g'ib qo'yishi mumkin. Tezlik bu yerda muhim emas -
 * natijani hech kim kutib turmaydi.
 */
export const recomputeAll = async ({
  scope = "full",
  trigger = "nightly",
  now = new Date(),
} = {}) => {
  const branches = await Branch.find({ isActive: true, isDeleted: { $ne: true } })
    .select("_id name")
    .lean();

  const results = [];
  for (const b of branches) {
    try {
      const r = await recomputeBranch(b._id, { scope, trigger, now });
      results.push({ ...r, name: b.name });
      logger.info({ branch: b.name, scope, counts: r.counts }, "AI qayta hisoblash tayyor");
    } catch (err) {
      // Bitta filial xatosi qolganini to'xtatmaydi - aks holda bitta
      // filialdagi buzuq ma'lumot butun markazni AI'siz qoldirardi.
      logger.error({ err, branch: b.name }, "AI qayta hisoblash xato");
      results.push({ branchId: String(b._id), name: b.name, error: err.message });
    }
  }
  return results;
};

export { FULL_PIPELINE, FAST_PIPELINE };
