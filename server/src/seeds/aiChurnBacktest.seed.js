import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import Branch from "../models/branch.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import User from "../models/user.model.js";
import { ROLES } from "../constants/roles.js";
import { runWithBranchContext } from "../helpers/branchContext.helper.js";
import { collectStudentSignals } from "../modules/ai/signals/student.signal.js";
import { scoreChurn } from "../modules/ai/scoring/churn.scoring.js";
import { resolveConfig } from "../modules/ai/services/aiConfig.service.js";

// CHURN MODELI BACKTEST'i.
//
// Savol: "kesish sanasida hisoblangan ball, keyingi 60 kunda kim ketishini
// haqiqatan bashorat qiladimi?" Javobsiz vaznlar shunchaki taxmin bo'lib
// qoladi, "AI" esa - AI teatri.
//
// Usul:
//   1. cutoff = bugun − HORIZON kun
//   2. cutoff sanasida FAOL bo'lgan o'quvchilarni olamiz
//   3. Signallarni cutoff HOLATIGA ko'ra hisoblaymiz (oynalar shu sanada
//      tugaydi - kelajakdagi davomat/baho ko'rinmaydi)
//   4. Label: cutoff dan keyin leftReason="removed" bilan ketganmi
//   5. O'lchov: AUC + precision@K + guruhlar o'rtachasi
//
// ┌─ HALOLLIK OGOHLANTIRISHI ────────────────────────────────────────────┐
// │ StudentPayment JOYIDA o'zgartiriladi (paidAmount to'langach yangila- │
// │ nadi), shuning uchun "cutoff sanasidagi qarz" ni aniq tiklab         │
// │ bo'lmaydi - qarz signali KELAJAK ma'lumotini qisman ko'radi          │
// │ (leakage). Bu AUC ni SUN'IY OSHIRADI.                                │
// │                                                                       │
// │ Shu sababli skript ikki natija chiqaradi:                            │
// │   • to'liq model (qarz bilan)   - optimistik chegara                 │
// │   • qarzsiz model               - ISHONCHLI baho                     │
// │ Qaror qabul qilishda IKKINCHISIGA qarang.                            │
// │ To'liq yechim: PaymentTransaction sanalaridan qarz holatini tiklash  │
// │ (Faza 2) yoki to'lov holati snapshot'ini yozib borish.               │
// └───────────────────────────────────────────────────────────────────────┘

const DAY_MS = 24 * 60 * 60 * 1000;
// Bashorat ufqi: ball qo'yilgandan keyin necha kun ichida ketish kuzatiladi.
const HORIZON_DAYS = Number(process.env.AI_BACKTEST_HORIZON || 60);

/** Rank-asosli AUC (Mann-Whitney U). 0.5 = tasodif, 1.0 = mukammal. */
const auc = (rows) => {
  const pos = rows.filter((r) => r.label === 1).map((r) => r.score);
  const neg = rows.filter((r) => r.label === 0).map((r) => r.score);
  if (!pos.length || !neg.length) return null;

  // Barcha (musbat, manfiy) juftliklar bo'yicha: musbat yuqoriroqmi.
  // Teng ballar 0.5 hisoblanadi.
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return wins / (pos.length * neg.length);
};

const precisionAtK = (rows, k) => {
  const top = [...rows].sort((a, b) => b.score - a.score).slice(0, k);
  if (!top.length) return null;
  return top.filter((r) => r.label === 1).length / top.length;
};

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/** Bitta filial uchun (o'z branch kontekstida) backtest qatorlarini yig'adi. */
const backtestBranch = async (branch, cutoff, now) =>
  runWithBranchContext(
    {
      branchId: String(branch._id),
      allowedBranchIds: [String(branch._id)],
      canSeeAllBranches: false,
      userId: null,
    },
    async () => {
      const groups = await Group.find({ branchId: branch._id, isDeleted: false })
        .select("_id")
        .lean();
      if (!groups.length) return [];
      const groupIds = groups.map((g) => g._id);

      // cutoff sanasida FAOL bo'lgan a'zoliklar:
      //   joinedAt <= cutoff  VA  (leftAt yo'q YOKI leftAt > cutoff)
      const memberships = await GroupMembership.find({
        group: { $in: groupIds },
        isDeleted: false,
        joinedAt: { $lte: cutoff },
        $or: [{ leftAt: null }, { leftAt: { $gt: cutoff } }],
      })
        .select("student group leftAt leftReason")
        .lean();
      if (!memberships.length) return [];

      const byStudent = new Map();
      for (const m of memberships) {
        const sid = String(m.student);
        if (!byStudent.has(sid)) {
          byStudent.set(sid, { groupIds: [], left: false });
        }
        const entry = byStudent.get(sid);
        entry.groupIds.push(m.group);
        // LABEL: cutoff dan keyin, ufq ichida "removed" bilan ketgan.
        // "transferred" va "graduated" MUSBAT EMAS - bular churn emas
        // (ko'chirish va bitirish). Ularni churn deb belgilash modelni
        // butunlay buzardi.
        if (
          m.leftReason === "removed" &&
          m.leftAt &&
          m.leftAt > cutoff &&
          m.leftAt <= now
        ) {
          entry.left = true;
        }
      }

      const users = await User.find({
        _id: {
          $in: [...byStudent.keys()].map((id) => new mongoose.Types.ObjectId(id)),
        },
        role: ROLES.STUDENT,
        isDeleted: false,
      })
        .select("_id firstName lastName enrolledAt")
        .lean();

      const students = users.map((u) => ({
        ...u,
        groupIds: byStudent.get(String(u._id))?.groupIds || [],
      }));
      if (!students.length) return [];

      // MUHIM: signallar CUTOFF holatiga ko'ra hisoblanadi - oynalar
      // shu sanada tugaydi, shuning uchun keyingi davomat/baho ko'rinmaydi.
      const signalsMap = await collectStudentSignals(students, cutoff);
      const config = await resolveConfig(branch._id);

      // Qarzsiz variant: debt signalini neytrallashtiramiz (leakage'siz baho).
      const configNoDebt = {
        ...config,
        churnWeights: { ...config.churnWeights, debtDays: 0 },
      };

      const rows = [];
      for (const s of students) {
        const sid = String(s._id);
        const signals = signalsMap.get(sid);
        if (!signals) continue;

        const full = scoreChurn(signals, config);
        const noDebt = scoreChurn(signals, configNoDebt);

        rows.push({
          studentId: sid,
          name: `${s.firstName} ${s.lastName}`.trim(),
          branch: branch.name,
          label: byStudent.get(sid)?.left ? 1 : 0,
          score: full.score,
          scoreNoDebt: noDebt.score,
          confidence: full.confidence,
          lessons: signals.attendance.lessons,
        });
      }
      return rows;
    },
  );

const report = (title, rows, scoreKey) => {
  const scored = rows.map((r) => ({ ...r, score: r[scoreKey] }));
  const churned = scored.filter((r) => r.label === 1);
  const stayed = scored.filter((r) => r.label === 0);

  return {
    title,
    auc: auc(scored),
    precisionAt10: precisionAtK(scored, 10),
    precisionAt20: precisionAtK(scored, 20),
    meanScoreChurned: Number(mean(churned.map((r) => r.score)).toFixed(3)),
    meanScoreStayed: Number(mean(stayed.map((r) => r.score)).toFixed(3)),
  };
};

const run = async () => {
  await connectDB();
  const now = new Date();
  const cutoff = new Date(now.getTime() - HORIZON_DAYS * DAY_MS);

  // Tarixiy ma'lumot yetarlimi - eng eski "removed" a'zolikni tekshiramiz.
  const oldest = await GroupMembership.findOne({ leftReason: "removed", leftAt: { $ne: null } })
    .sort({ leftAt: 1 })
    .select("leftAt")
    .lean();

  if (!oldest) {
    logger.warn(
      "Tarixiy churn ma'lumoti YO'Q (leftReason='removed' yozuvlar topilmadi). " +
        "Backtest o'tkazib bo'lmaydi - vaznlar kalibrlanmagan holda qoladi.",
    );
    await disconnectDB();
    return;
  }

  const historyDays = Math.floor((now - new Date(oldest.leftAt)) / DAY_MS);
  logger.info(
    { historyDays, horizonDays: HORIZON_DAYS, cutoff: cutoff.toISOString().slice(0, 10) },
    "Backtest boshlandi",
  );
  if (historyDays < HORIZON_DAYS * 2) {
    logger.warn(
      `Tarix qisqa (${historyDays} kun). Natija indikativ - kamida ` +
        `${HORIZON_DAYS * 2} kun tavsiya etiladi.`,
    );
  }

  const branches = await Branch.find({ isDeleted: { $ne: true } })
    .select("_id name")
    .lean();

  let rows = [];
  for (const b of branches) {
    const r = await backtestBranch(b, cutoff, now);
    rows = rows.concat(r);
  }

  const churnedCount = rows.filter((r) => r.label === 1).length;
  logger.info(
    { students: rows.length, churned: churnedCount, retained: rows.length - churnedCount },
    "Namuna",
  );

  if (churnedCount < 5) {
    logger.warn(
      `Ufq ichida faqat ${churnedCount} ta ketish bor - o'lchov statistik ` +
        "ahamiyatsiz. AI_BACKTEST_HORIZON ni oshiring yoki ko'proq ma'lumot kuting.",
    );
  }

  const full = report("To'liq model (qarz bilan — OPTIMISTIK, leakage bor)", rows, "score");
  const noDebt = report("Qarzsiz model (ISHONCHLI baho)", rows, "scoreNoDebt");

  for (const r of [full, noDebt]) {
    logger.info(
      {
        AUC: r.auc == null ? "n/a" : r.auc.toFixed(3),
        "precision@10": r.precisionAt10 == null ? "n/a" : r.precisionAt10.toFixed(2),
        "precision@20": r.precisionAt20 == null ? "n/a" : r.precisionAt20.toFixed(2),
        ketganlarOrtachaBall: r.meanScoreChurned,
        qolganlarOrtachaBall: r.meanScoreStayed,
      },
      r.title,
    );
  }

  // Talqin: AUC < 0.6 → model tasodifdan deyarli farq qilmaydi, vaznlarni
  // qayta ko'rish kerak. 0.7+ → ishlatsa bo'ladi. 0.8+ → yaxshi.
  const reliable = noDebt.auc;
  if (reliable != null) {
    const verdict =
      reliable >= 0.8
        ? "YAXSHI - ishlatishga tayyor"
        : reliable >= 0.7
          ? "QONIQARLI - ishlatsa bo'ladi, kuzatib boring"
          : reliable >= 0.6
            ? "ZAIF - vaznlarni qayta ko'ring"
            : "TASODIFDAN FARQ QILMAYDI - ishlatmang, avval vaznlarni tuzating";
    logger.info({ auc: reliable.toFixed(3) }, `Xulosa: ${verdict}`);
  }

  await disconnectDB();
};

run().catch((err) => {
  logger.error({ err }, "Backtest xato");
  process.exit(1);
});
