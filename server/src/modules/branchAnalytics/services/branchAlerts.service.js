import Branch from "../../../models/branch.model.js";
import { utilization, churn } from "./branchMetrics.service.js";
import * as journal from "../../journal/services/journal.service.js";
import * as journalVerify from "../../journal/services/journalVerify.service.js";
import CashTransfer, { TRANSFER_STATUSES } from "../../../models/cashTransfer.model.js";
import Shift, { SHIFT_STATUSES } from "../../../models/shift.model.js";

// ANOMALIYA XABARNOMALARI.
//
// ══════════════════════════════════════════════════════════════════
// NEGA STATIK CHEGARA, STATISTIK EMAS
// ══════════════════════════════════════════════════════════════════
// z-score va mavsumiy bazaviy chiziq jozibali ko'rinadi, lekin ular
// TARIX talab qiladi - kamida bir necha oylik ma'lumot. Yangi tizimda
// u yo'q, va statistik model shovqinni "anomaliya" deb ko'rsatib,
// birinchi haftadayoq ishonchni yo'qotardi.
//
// Statik chegara esa TUSHUNARLI: "bandlik 30% dan past" - owner buni
// o'qib, roziligini yoki e'tirozini darhol bildira oladi. Statistik
// modelga o'tish keyin, tarix yig'ilgach mumkin.
//
// ══════════════════════════════════════════════════════════════════
// ALERT CHARCHOG'IGA QARSHI
// ══════════════════════════════════════════════════════════════════
// Har bir qoida DARAJA (severity) qaytaradi va ro'yxat shu bo'yicha
// saralanadi. Hamma narsani "kritik" qilish - eng keng tarqalgan xato:
// bir hafta ichida owner ularni umuman o'qimay qo'yadi.
//
// KRITIK faqat PUL YO'QOLGANDA yoki hisob-kitob buzilganda.

export const SEVERITY = Object.freeze({
  CRITICAL: "critical",
  WARNING: "warning",
  INFO: "info",
});

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

// Chegaralar - kod ichida, ATAYLAB. Ular biznes qarori va ularni
// o'zgartirish uchun kod ko'rib chiqilishi kerak; sozlamaga chiqarilsa
// kimdir jimgina "0" qo'yib alertni o'chirib qo'yardi.
export const THRESHOLDS = Object.freeze({
  // Xona bandligi shundan past bo'lsa - resurs behuda turibdi.
  LOW_UTILIZATION_PERCENT: 30,
  // Churn shundan yuqori bo'lsa - o'quvchilar ketyapti.
  HIGH_CHURN_PERCENT: 25,
  // Inkassatsiya shuncha kundan ortiq "yo'lda" tursa - yo'qolgan bo'lishi mumkin.
  TRANSIT_STALE_DAYS: 3,
  // Smena shuncha soatdan ortiq ochiq tursa - yopish unutilgan.
  SHIFT_STALE_HOURS: 24,
  // Kassada shundan ko'p naqd yig'ilsa - inkassatsiya vaqti keldi.
  CASH_PILEUP: 20_000_000,
});

const alert = (severity, code, branchId, branchName, message, extra = {}) => ({
  severity,
  code,
  branchId: branchId ? String(branchId) : null,
  branchName: branchName || "",
  message,
  ...extra,
});

/**
 * BARCHA QOIDALARNI BAHOLAYDI.
 *
 * Ko'lam: filial direktori chaqirsa faqat o'z filiali bo'yicha alert
 * oladi (ichkaridagi servislar branchFilter ostida). Owner esa
 * hammasini ko'radi.
 *
 * ISTISNO - `journal_unbalanced` va `wiring_gap`: ular ATAYLAB butun
 * tarmoq bo'yicha, chunki nomuvozanat bitta filialga tegishli emas.
 */
export const evaluate = async () => {
  const alerts = [];

  const branches = await Branch.find({ isDeleted: false, isActive: true })
    .select("name")
    .lean();
  const nameOf = (id) =>
    branches.find((b) => String(b._id) === String(id))?.name || "";

  // ── 1) PUL: jurnal muvozanati (KRITIK) ──
  const rec = await journal.reconcile();
  if (!rec.ok) {
    if (rec.unbalancedEntries.length) {
      alerts.push(
        alert(
          SEVERITY.CRITICAL,
          "journal_unbalanced",
          null,
          "",
          `Jurnalda ${rec.unbalancedEntries.length} ta nomuvozanat yozuv - hisob-kitob buzilgan`,
          { count: rec.unbalancedEntries.length },
        ),
      );
    }
    for (const m of rec.interBranch.mismatches) {
      alerts.push(
        alert(
          SEVERITY.CRITICAL,
          "inter_branch_mismatch",
          null,
          "",
          `Filiallararo balans teng emas: farq ${m.diff}`,
          { branches: m.branches, diff: m.diff },
        ),
      );
    }
  }

  // ── 2) PUL: jurnalga tushmagan hujjatlar (KRITIK) ──
  const wiring = await journalVerify.verify();
  if (!wiring.ok) {
    alerts.push(
      alert(
        SEVERITY.CRITICAL,
        "wiring_gap",
        null,
        "",
        `${wiring.totalMissing} ta moliyaviy hujjat jurnalga tushmagan - kassa qoldig'i kam ko'rsatyapti`,
        {
          missing: wiring.totalMissing,
          fix: "npm run migrate:journal-backfill",
        },
      ),
    );
  }

  // ── 3) YO'LDA QOTIB QOLGAN INKASSATSIYA (KRITIK) ──
  //
  // Pul kassadan chiqqan, lekin manzilga yetmagan. Kunlar o'tgani sari
  // "yo'qolgan" ehtimoli oshadi - shuning uchun kritik.
  const staleDate = new Date(
    Date.now() - THRESHOLDS.TRANSIT_STALE_DAYS * 24 * 60 * 60 * 1000,
  );
  const stuck = await CashTransfer.find({
    status: TRANSFER_STATUSES.IN_TRANSIT,
    sentAt: { $lt: staleDate },
  })
    .select("fromBranchId toBranchId amount sentAt")
    .lean();
  for (const t of stuck) {
    const days = Math.floor((Date.now() - new Date(t.sentAt)) / (24 * 60 * 60 * 1000));
    alerts.push(
      alert(
        SEVERITY.CRITICAL,
        "transfer_stuck",
        t.fromBranchId,
        nameOf(t.fromBranchId),
        `Inkassatsiya ${days} kundan beri yo'lda: ${t.amount} so'm (${nameOf(t.toBranchId)} ga)`,
        { amount: t.amount, days, toBranchId: String(t.toBranchId) },
      ),
    );
  }

  // ── 4) FARQ CHIQQAN INKASSATSIYA (KRITIK) ──
  const disputed = await CashTransfer.find({ status: TRANSFER_STATUSES.DISPUTED })
    .select("fromBranchId discrepancy amount")
    .lean();
  for (const t of disputed) {
    alerts.push(
      alert(
        SEVERITY.CRITICAL,
        "transfer_disputed",
        t.fromBranchId,
        nameOf(t.fromBranchId),
        `Inkassatsiyada farq: ${t.discrepancy} so'm`,
        { discrepancy: t.discrepancy },
      ),
    );
  }

  // ── 5) OCHIQ QOLGAN SMENA (OGOHLANTIRISH) ──
  //
  // Yopilmagan smena - kamomad sezilmasligining asosiy sababi.
  const shiftStale = new Date(
    Date.now() - THRESHOLDS.SHIFT_STALE_HOURS * 60 * 60 * 1000,
  );
  const openShifts = await Shift.find({
    status: SHIFT_STATUSES.OPEN,
    openedAt: { $lt: shiftStale },
  })
    .select("branchId openedAt")
    .lean();
  for (const s of openShifts) {
    const hours = Math.floor((Date.now() - new Date(s.openedAt)) / (60 * 60 * 1000));
    alerts.push(
      alert(
        SEVERITY.WARNING,
        "shift_open_too_long",
        s.branchId,
        nameOf(s.branchId),
        `Smena ${hours} soatdan beri ochiq - yopish unutilgan`,
        { hours },
      ),
    );
  }

  // ── 6) KASSADA PUL YIG'ILIB QOLGAN (OGOHLANTIRISH) ──
  const treasury = await journal.treasuryBalances();
  const cashByBranch = new Map();
  for (const t of treasury) {
    if (t.kind !== "cash") continue;
    cashByBranch.set(String(t.branchId), t.balance);
  }
  for (const [branchId, amount] of cashByBranch) {
    if (amount > THRESHOLDS.CASH_PILEUP) {
      alerts.push(
        alert(
          SEVERITY.WARNING,
          "cash_pileup",
          branchId,
          nameOf(branchId),
          `Kassada ${amount} so'm naqd yig'ilgan - inkassatsiya vaqti keldi`,
          { amount },
        ),
      );
    }
  }

  // ── 7) BO'SH YOTGAN XONALAR (OGOHLANTIRISH) ──
  const util = await utilization();
  for (const u of util) {
    // null = xona kiritilmagan, bu alert emas (ma'lumot yo'q).
    if (u.utilizationPercent === null) continue;
    if (u.utilizationPercent < THRESHOLDS.LOW_UTILIZATION_PERCENT) {
      alerts.push(
        alert(
          SEVERITY.WARNING,
          "low_utilization",
          u.branchId,
          u.name,
          `Xonalar bandligi ${u.utilizationPercent}% - ${u.roomCount} ta xona bo'sh yotibdi`,
          { utilizationPercent: u.utilizationPercent, roomCount: u.roomCount },
        ),
      );
    }
  }

  // ── 8) CHURN OSHGAN (OGOHLANTIRISH) ──
  const ch = await churn({});
  for (const c of ch) {
    if (c.churnPercent === null) continue;
    if (c.churnPercent > THRESHOLDS.HIGH_CHURN_PERCENT) {
      alerts.push(
        alert(
          SEVERITY.WARNING,
          "high_churn",
          c.branchId,
          c.name,
          `O'quvchilar ketishi ${c.churnPercent}% - ${c.churned} ta o'quvchi ketdi`,
          { churnPercent: c.churnPercent, churned: c.churned },
        ),
      );
    }
  }

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    alerts,
    counts: {
      critical: alerts.filter((a) => a.severity === SEVERITY.CRITICAL).length,
      warning: alerts.filter((a) => a.severity === SEVERITY.WARNING).length,
      info: alerts.filter((a) => a.severity === SEVERITY.INFO).length,
    },
    thresholds: THRESHOLDS,
  };
};
