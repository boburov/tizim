import Branch from "../../../models/branch.model.js";
import logger from "../../../config/logger.js";
import { runWithBranchContext } from "../../../helpers/branchContext.helper.js";
import { recomputeStudentInsights } from "./studentInsight.service.js";

// QAYTA HISOBLASH orkestratori.
//
// Har bir filial O'Z branch kontekstida ishlaydi. Bu shart emas "chiroyli
// bo'lsin" uchun - branchMatchStage() AsyncLocalStorage'dan o'qiydi, va
// kontekstsiz ishga tushirilsa filtr BO'SH qaytadi va barcha filiallar
// ma'lumoti aralashadi. Job kontekstni ochiq o'rnatishi SHART.

/**
 * Bitta filialni qayta hisoblaydi (o'z kontekstida).
 */
export const recomputeBranch = async (branchId, now = new Date()) =>
  runWithBranchContext(
    {
      branchId: String(branchId),
      allowedBranchIds: [String(branchId)],
      canSeeAllBranches: false,
      userId: null,
    },
    async () => {
      const students = await recomputeStudentInsights(branchId, now);
      return { branchId: String(branchId), students };
    },
  );

/**
 * Barcha faol filiallarni ketma-ket qayta hisoblaydi.
 *
 * KETMA-KET, parallel emas: 500 o'quvchilik filial bir nechta og'ir
 * aggregation qiladi va ularni bir vaqtda ishga tushirish tungi soatlarda
 * ham Mongo'ni bo'g'ib qo'yishi mumkin. Tezlik bu yerda muhim emas -
 * job kechasi ishlaydi.
 */
export const recomputeAll = async (now = new Date()) => {
  const branches = await Branch.find({ isActive: true, isDeleted: { $ne: true } })
    .select("_id name")
    .lean();

  const results = [];
  for (const b of branches) {
    try {
      const r = await recomputeBranch(b._id, now);
      results.push({ ...r, name: b.name });
      logger.info(
        {
          branch: b.name,
          scanned: r.students.scanned,
          churn: r.students.churn,
          payment: r.students.payment,
        },
        "AI qayta hisoblash",
      );
    } catch (err) {
      // Bitta filial xatosi qolganini to'xtatmasligi kerak.
      logger.error({ err, branch: b.name }, "AI qayta hisoblash xato");
      results.push({ branchId: String(b._id), name: b.name, error: err.message });
    }
  }
  return results;
};
