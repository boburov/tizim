/**
 * ══════════════════════════════════════════════════════════════════════
 * MOLIYAVIY QOIDALAR — DETERMINISTIK, LLM'SIZ
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── ENG MUHIM CHEGARA ──
 * Bu yerdagi qoidalar HECH QANDAY moliyaviy raqamni HISOBLAMAYDI.
 * Ular tayyor tahlil natijalarini (analytics qatlami) o'qib, faqat
 * TAQQOSLAYDI va chegaradan oshganini aytadi.
 *
 * Ya'ni zanjir:
 *     jurnal → tahlil (hisoblaydi) → qoidalar (taqqoslaydi) → LLM (yozadi)
 *
 * LLM hech qachon raqam ko'rmaydi-yu, uni o'zgartira olmaydi ham:
 * u faqat TAYYOR faktlarni jumlaga aylantiradi.
 *
 * ── NEGA ALOHIDA FAYL ──
 * Qoidalar sof funksiyalar: kirish — tahlil natijasi, chiqish —
 * tuzilmali signal. Ular bazaga ham, tarmoqqa ham murojaat qilmaydi,
 * shuning uchun testda aynan chegaraviy qiymatlar bilan sinaladi
 * (0, null, chegaraning o'zi, chegaradan bir birlik pastda).
 */

/** Biznes qarori — bitta joyda, o'zgartirish oson. */
export const THRESHOLDS = Object.freeze({
  expenseGrowthPercent: 20,
  collectionDropPoints: 5,
  collectionRateFloor: 85,
  overdue60plusAmount: 1_000_000,
  budgetOverPercent: 10,
  discountVsRevenueGapPoints: 15,
  refundRatePercent: 5,
  refundMultiplier: 2,
  directionMarginDropPoints: 10,
  directionMarginFloor: 20,
  teacherProfitDropPercent: -20,
  roomUtilizationFloor: 40,
  concentrationSharePercent: 60,
  concentrationTopN: 3,
  // TEKIS TAQSIMOTDAN QANCHA OSHSA — signal.
  //
  // Yolg'iz ulush chegarasi YETARLI EMAS: 5 ta TENG guruhda ham
  // eng yirik 3 tasi 60% ni tashkil qiladi (3/5). Ya'ni mukammal
  // teng markaz ham "konsentratsiya" deb belgilanardi.
  // Shuning uchun ulush TEKIS TAQSIMOT BAZASI bilan solishtiriladi.
  concentrationExcessPoints: 15,
  positiveGrowthPercent: 15,
});

export const SEVERITY = Object.freeze({
  URGENT: "urgent",
  WATCH: "watch",
  POSITIVE: "positive",
});

export const ACTION = Object.freeze({
  REVIEW_EXPENSE: "REVIEW_EXPENSE",
  CONTACT_DEBTORS: "CONTACT_DEBTORS",
  ESCALATE_COLLECTION: "ESCALATE_COLLECTION",
  REVIEW_BUDGET: "REVIEW_BUDGET",
  REVIEW_DISCOUNT_POLICY: "REVIEW_DISCOUNT_POLICY",
  INVESTIGATE_REFUNDS: "INVESTIGATE_REFUNDS",
  REVIEW_DIRECTION: "REVIEW_DIRECTION",
  REVIEW_TEACHER: "REVIEW_TEACHER",
  REVIEW_ROOM_SCHEDULE: "REVIEW_ROOM_SCHEDULE",
  REVIEW_CONCENTRATION: "REVIEW_CONCENTRATION",
  NONE: "NONE",
});

const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const money = (v) => new Intl.NumberFormat("uz-UZ").format(Math.round(v || 0));
const pct = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}%`);

/** Bitta dalil qatori — UI da ham, LLM kirishida ham AYNAN shu shakl. */
const ev = (label, { current, previous = null, changePercent = null, unit = "so'm" }) => ({
  label, current, previous, changePercent, unit,
});

/**
 * Signal quruvchi.
 *
 * `id` BARQAROR bo'lishi shart: UI uni drill-down va "ko'rildi"
 * holati uchun ishlatadi, har so'rovda o'zgarsa ular buzilardi.
 */
const signal = ({
  type, severity, title, entityType = null, entityId = null, entityName = null,
  metric, currentValue, previousValue = null, changeAmount = null, changePercent = null,
  evidence = [], actionType, actionLabel, actionTarget = {}, confidenceReasons = [],
}) => ({
  id: `${type}${entityId ? `:${entityId}` : ""}`,
  type,
  severity,
  title,
  entityType,
  entityId,
  entityName,
  metric,
  currentValue: num(currentValue),
  previousValue: num(previousValue),
  changeAmount: num(changeAmount),
  changePercent: num(changePercent),
  // MASHINA O'QIY OLADIGAN DALIL — faqat matn emas (talab D).
  evidence,
  recommendedActionType: actionType,
  recommendedAction: { label: actionLabel, target: actionTarget },
  // Ishonch darajasi qoidadan keladi; umumiy sabablar keyin qo'shiladi.
  confidenceReasons,
});

// ══════════════════════════════════════════════════════════════════════
// QOIDALAR
// ══════════════════════════════════════════════════════════════════════

/** 1 — CHIQIM O'SISHI (kategoriya darajasida: sabab ko'rinsin). */
export const ruleExpenseGrowth = ({ expenses, summary }) => {
  const out = [];
  for (const c of expenses?.topGrowing || []) {
    if (c.changePercent === null || c.changePercent < THRESHOLDS.expenseGrowthPercent) continue;
    const revGrowth = summary?.revenue?.changePercent ?? null;
    out.push(signal({
      type: "expense_growth",
      severity: c.changePercent >= 50 ? SEVERITY.URGENT : SEVERITY.WATCH,
      title: `"${c.name}" xarajati ${pct(c.changePercent)} oshdi`,
      entityType: "expenseCategory", entityId: c.categoryId, entityName: c.name,
      metric: "expense_by_category",
      currentValue: c.current, previousValue: c.previous,
      changeAmount: c.change, changePercent: c.changePercent,
      evidence: [
        ev(`${c.name} xarajati`, { current: c.current, previous: c.previous, changePercent: c.changePercent }),
        ev("Daromad", {
          current: summary?.revenue?.current ?? null,
          previous: summary?.revenue?.previous ?? null,
          changePercent: revGrowth,
        }),
      ],
      actionType: ACTION.REVIEW_EXPENSE,
      actionLabel: "Chiqim kategoriyasini ko'rish",
      actionTarget: { tab: "expenses", filters: { expenseCategoryId: c.categoryId } },
    }));
  }
  return out;
};

/** 2 — UNDIRISH DARAJASINING PASAYISHI. */
export const ruleCollection = ({ summary, receivables }) => {
  const cur = summary?.receivables?.collectionRate?.current ?? null;
  const prev = summary?.receivables?.collectionRate?.previous ?? null;
  if (cur === null) return [];

  const dropped = prev !== null && prev - cur >= THRESHOLDS.collectionDropPoints;
  const low = cur < THRESHOLDS.collectionRateFloor;
  if (!dropped && !low) return [];

  return [signal({
    type: dropped ? "collection_drop" : "collection_low",
    severity: dropped ? SEVERITY.URGENT : SEVERITY.WATCH,
    title: dropped
      ? `Undirish darajasi ${prev}% dan ${cur}% ga tushdi`
      : `Undirish darajasi past: ${cur}%`,
    metric: "collection_rate",
    currentValue: cur, previousValue: prev,
    changeAmount: prev === null ? null : Math.round((cur - prev) * 100) / 100,
    changePercent: null,
    evidence: [
      ev("Undirish darajasi", { current: cur, previous: prev, unit: "%" }),
      ev("Kutilgan", { current: summary?.receivables?.expected?.current ?? null }),
      ev("Undirilgan", { current: summary?.receivables?.collected?.current ?? null }),
      ev("Qoldiq", { current: summary?.receivables?.outstanding?.current ?? null }),
      ev("Qarzdor o'quvchilar", { current: receivables?.totals?.debtorStudents ?? null, unit: "ta" }),
    ],
    actionType: ACTION.CONTACT_DEBTORS,
    actionLabel: "Qarzdorlarni ko'rish",
    actionTarget: { tab: "receivables" },
  })];
};

/** 3 — ESKI QARZ (60+ kun). */
export const ruleReceivableAging = ({ receivables }) => {
  const d60 = receivables?.aging?.d60plus ?? 0;
  if (!d60 || d60 < THRESHOLDS.overdue60plusAmount) return [];
  return [signal({
    type: "aged_receivables",
    severity: SEVERITY.URGENT,
    title: `${money(d60)} so'm 60 kundan ortiq muddati o'tgan`,
    metric: "receivables_aging_60plus",
    currentValue: d60, previousValue: null,
    evidence: [
      ev("60+ kunlik qarz", { current: d60 }),
      ev("Jami qoldiq", { current: receivables?.totals?.outstanding ?? null }),
      ev("31–60 kun", { current: receivables?.aging?.d31_60 ?? null }),
      ev("Qarzdor o'quvchilar", { current: receivables?.totals?.debtorStudents ?? null, unit: "ta" }),
    ],
    actionType: ACTION.ESCALATE_COLLECTION,
    actionLabel: "Eski qarzlarni ochish",
    actionTarget: { tab: "receivables" },
  })];
};

/** 4 — BYUDJETDAN OSHISH. */
export const ruleBudgetOverspend = ({ budget }) => {
  if (!budget?.hasBudget) return [];
  const out = [];
  for (const line of budget.overBudget || []) {
    if (line.variancePercent === null || line.variancePercent < THRESHOLDS.budgetOverPercent) continue;
    out.push(signal({
      type: "budget_overspend",
      severity: line.variancePercent >= 40 ? SEVERITY.URGENT : SEVERITY.WATCH,
      title: `"${line.label}" byudjetdan ${pct(line.variancePercent)} oshdi`,
      entityType: line.categoryId ? "expenseCategory" : "budgetLine",
      entityId: line.categoryId || line.id, entityName: line.label,
      metric: "budget_variance",
      currentValue: line.actual, previousValue: line.budget,
      changeAmount: line.variance, changePercent: line.variancePercent,
      evidence: [
        ev("Byudjet (reja)", { current: line.budget }),
        ev("Fakt", { current: line.actual }),
        ev("Farq", { current: line.variance, changePercent: line.variancePercent }),
      ],
      actionType: ACTION.REVIEW_BUDGET,
      actionLabel: "Byudjetni ko'rish",
      actionTarget: { tab: "budget" },
    }));
  }
  return out;
};

/** 5 — CHEGIRMA ANOMALIYASI (daromaddan tez o'sish). */
export const ruleDiscountAnomaly = ({ discounts, summary }) => {
  const dG = discounts?.total?.changePercent ?? null;
  const rG = summary?.revenue?.changePercent ?? null;
  if (dG === null || rG === null) return [];
  if (dG - rG < THRESHOLDS.discountVsRevenueGapPoints) return [];
  return [signal({
    type: "discount_anomaly",
    severity: SEVERITY.WATCH,
    title: `Chegirmalar ${pct(dG)}, daromad esa ${pct(rG)} o'zgardi`,
    metric: "discount_vs_revenue_growth",
    currentValue: discounts?.total?.current ?? null,
    previousValue: discounts?.total?.previous ?? null,
    changeAmount: discounts?.total?.change ?? null,
    changePercent: dG,
    evidence: [
      ev("Chegirma", {
        current: discounts?.total?.current ?? null,
        previous: discounts?.total?.previous ?? null, changePercent: dG,
      }),
      ev("Daromad", {
        current: summary?.revenue?.current ?? null,
        previous: summary?.revenue?.previous ?? null, changePercent: rG,
      }),
      ev("Chegirma darajasi", {
        current: discounts?.discountRatePercent?.current ?? null,
        previous: discounts?.discountRatePercent?.previous ?? null, unit: "%",
      }),
    ],
    actionType: ACTION.REVIEW_DISCOUNT_POLICY,
    actionLabel: "Chegirmalarni ko'rish",
    actionTarget: { tab: "revenue" },
  })];
};

/** 6 — QAYTARIM ANOMALIYASI. */
export const ruleRefundAnomaly = ({ refunds }) => {
  const cur = refunds?.amount?.current ?? 0;
  const prev = refunds?.amount?.previous ?? 0;
  const rate = refunds?.refundRatePercent?.current ?? null;
  if (!cur) return [];

  const spiked = prev > 0 && cur >= prev * THRESHOLDS.refundMultiplier;
  const highRate = rate !== null && rate >= THRESHOLDS.refundRatePercent;
  if (!spiked && !highRate) return [];

  const times = prev > 0 ? Math.round((cur / prev) * 10) / 10 : null;
  return [signal({
    type: "refund_spike",
    severity: spiked ? SEVERITY.URGENT : SEVERITY.WATCH,
    title: spiked
      ? `Qaytarimlar ${times}× oshdi`
      : `Qaytarim darajasi yuqori: ${rate}%`,
    metric: "refund_amount",
    currentValue: cur, previousValue: prev,
    changeAmount: cur - prev,
    changePercent: refunds?.amount?.changePercent ?? null,
    evidence: [
      ev("Qaytarim summasi", {
        current: cur, previous: prev, changePercent: refunds?.amount?.changePercent ?? null,
      }),
      ev("Qaytarim soni", { current: refunds?.count?.current ?? null, unit: "ta" }),
      ev("Qaytarim darajasi", { current: rate, unit: "%" }),
    ],
    actionType: ACTION.INVESTIGATE_REFUNDS,
    actionLabel: "Qaytarimlarni ko'rish",
    actionTarget: { tab: "revenue" },
  })];
};

/** 7 — YO'NALISH FOYDALILIGINING PASAYISHI. */
export const ruleDirectionRisk = ({ directions, directionsPrev }) => {
  const prevById = new Map((directionsPrev?.items || []).map((d) => [d.courseId, d]));
  const out = [];
  for (const d of directions?.items || []) {
    if (d.revenue <= 0) continue;
    const cur = d.contributionMarginPercent;
    if (cur === null) continue;
    const prev = prevById.get(d.courseId)?.contributionMarginPercent ?? null;
    const dropped = prev !== null && prev - cur >= THRESHOLDS.directionMarginDropPoints;
    const belowFloor = cur < THRESHOLDS.directionMarginFloor;
    if (!dropped && !belowFloor) continue;

    out.push(signal({
      type: "direction_risk",
      severity: dropped && belowFloor ? SEVERITY.URGENT : SEVERITY.WATCH,
      title: dropped
        ? `"${d.name}" marjasi ${prev}% dan ${cur}% ga tushdi`
        : `"${d.name}" hissa marjasi ${cur}%`,
      entityType: "course", entityId: d.courseId, entityName: d.name,
      metric: "contribution_margin",
      currentValue: cur, previousValue: prev,
      changeAmount: prev === null ? null : Math.round((cur - prev) * 100) / 100,
      evidence: [
        ev("Hissa marjasi", { current: cur, previous: prev, unit: "%" }),
        ev("Daromad", { current: d.revenue }),
        ev("To'g'ridan-to'g'ri xarajat", { current: d.directCosts }),
        ev("Hissa foydasi", { current: d.contributionProfit }),
        ev("O'quvchilar", { current: d.students, unit: "ta" }),
      ],
      actionType: ACTION.REVIEW_DIRECTION,
      actionLabel: "Yo'nalishni ko'rish",
      actionTarget: { tab: "profitability", subTab: "directions", filters: { courseId: d.courseId } },
    }));
  }
  return out;
};

/**
 * 8 — O'QITUVCHI FOYDALILIGINING PASAYISHI.
 *
 * ⚠ MAOSH MA'LUMOTI. Bu qoida natijasi `salary.read` yoki
 * `payroll.read` bo'lmagan foydalanuvchiga BERILMAYDI — filtr
 * `financialIntelligence.service.js` da.
 */
export const ruleTeacherRisk = ({ teachers, teachersPrev }) => {
  const prevById = new Map((teachersPrev?.items || []).map((t) => [t.teacherId, t]));
  const out = [];
  for (const t of teachers?.items || []) {
    const prev = prevById.get(t.teacherId);
    if (!prev || !prev.contributionProfit) continue;
    const change = t.contributionProfit - prev.contributionProfit;
    const changePct = Math.round((change / Math.abs(prev.contributionProfit)) * 1000) / 10;
    if (changePct > THRESHOLDS.teacherProfitDropPercent) continue;

    out.push(signal({
      type: "teacher_risk",
      severity: changePct <= -40 ? SEVERITY.URGENT : SEVERITY.WATCH,
      title: `${t.name} hissa foydasi ${pct(changePct)} kamaydi`,
      entityType: "teacher", entityId: t.teacherId, entityName: t.name,
      metric: "teacher_contribution_profit",
      currentValue: t.contributionProfit, previousValue: prev.contributionProfit,
      changeAmount: change, changePercent: changePct,
      evidence: [
        ev("Hissa foydasi", {
          current: t.contributionProfit, previous: prev.contributionProfit, changePercent: changePct,
        }),
        ev("Daromad", { current: t.revenue, previous: prev.revenue }),
        ev("To'g'ridan-to'g'ri xarajat", { current: t.directCosts, previous: prev.directCosts }),
        ev("O'quvchilar", { current: t.students, previous: prev.students, unit: "ta" }),
      ],
      actionType: ACTION.REVIEW_TEACHER,
      actionLabel: "O'qituvchi tahlilini ochish",
      actionTarget: { tab: "profitability", subTab: "teachers", filters: { teacherId: t.teacherId } },
      // Atributsiya qamrovi past bo'lsa — ishonch cheklangan.
      confidenceReasons:
        teachers?.attribution?.coveragePercent !== null &&
        teachers?.attribution?.coveragePercent < 90
          ? [`O'qituvchi atributsiyasi qamrovi ${teachers.attribution.coveragePercent}%`]
          : [],
    }));
  }
  return out;
};

/** 9 — BO'SH TURGAN XONA. */
export const ruleRoomCapacity = ({ rooms }) => {
  const out = [];
  for (const r of rooms?.items || []) {
    if (r.utilizationPercent === null || r.utilizationPercent >= THRESHOLDS.roomUtilizationFloor) continue;
    out.push(signal({
      type: "room_underutilized",
      severity: SEVERITY.WATCH,
      title: `"${r.name}" xonasi ${r.utilizationPercent}% band`,
      entityType: "room", entityId: r.roomId, entityName: r.name,
      metric: "room_utilization",
      currentValue: r.utilizationPercent, previousValue: null,
      evidence: [
        ev("Bandlik", { current: r.utilizationPercent, unit: "%" }),
        ev("Band soat", { current: r.occupiedHours, unit: "soat" }),
        ev("Mavjud soat", { current: r.availableHours, unit: "soat" }),
        ev("Daromad", { current: r.revenue }),
      ],
      actionType: ACTION.REVIEW_ROOM_SCHEDULE,
      actionLabel: "Xona tahlilini ochish",
      actionTarget: { tab: "profitability", subTab: "rooms", filters: { roomId: r.roomId } },
      // Mavjud soat TAXMIN — bu har doim aytiladi (talab H).
      confidenceReasons: rooms?.availableHoursBasis?.assumption
        ? [`Mavjud soat taxmin asosida (${rooms.availableHoursBasis.workingHoursPerDay} soat × ${rooms.availableHoursBasis.workingDaysPerWeek} kun)`]
        : [],
    }));
  }
  return out;
};

/**
 * 10 — FOYDA KONSENTRATSIYASI.
 *
 * Kam sonli guruh butun hissa foydasini ko'tarib turgan bo'lsa —
 * bu tavakkalchilik: bitta guruh yopilsa natija keskin tushadi.
 *
 * DIQQAT: bu yerda ULUSH hisoblanadi, DAROMAD emas. Ulush — tayyor
 * tahlil natijalari ustidagi oddiy nisbat, moliyaviy faktni qayta
 * hisoblash emas.
 */
export const ruleConcentration = ({ groups }) => {
  const items = (groups?.items || []).filter((g) => g.contributionProfit > 0);
  if (items.length < THRESHOLDS.concentrationTopN + 1) return [];

  const total = items.reduce((s, g) => s + g.contributionProfit, 0);
  if (total <= 0) return [];
  const top = [...items]
    .sort((a, b) => b.contributionProfit - a.contributionProfit)
    .slice(0, THRESHOLDS.concentrationTopN);
  const topSum = top.reduce((s, g) => s + g.contributionProfit, 0);
  const share = Math.round((topSum / total) * 1000) / 10;
  if (share < THRESHOLDS.concentrationSharePercent) return [];

  // TEKIS TAQSIMOT BAZASI: N ta teng guruhda eng yirik K tasi
  // tabiiy ravishda K/N ulushga ega bo'ladi. Signal faqat SHUNDAN
  // sezilarli oshganda ma'noga ega.
  const evenShare = Math.round((top.length / items.length) * 1000) / 10;
  const excess = Math.round((share - evenShare) * 10) / 10;
  if (excess < THRESHOLDS.concentrationExcessPoints) return [];

  return [signal({
    type: "concentration_risk",
    severity: SEVERITY.WATCH,
    title: `Hissa foydasining ${share}% i ${top.length} ta guruhdan`,
    metric: "profit_concentration",
    currentValue: share, previousValue: null,
    evidence: [
      ev("Eng yirik guruhlar ulushi", { current: share, unit: "%" }),
      ev("Tekis taqsimotda kutilgan ulush", { current: evenShare, unit: "%" }),
      ev("Jami hissa foydasi", { current: total }),
      ...top.map((g) => ev(g.name, { current: g.contributionProfit })),
    ],
    actionType: ACTION.REVIEW_CONCENTRATION,
    actionLabel: "Guruhlar foydaliligini ko'rish",
    actionTarget: { tab: "profitability", subTab: "groups" },
  })];
};

/** 11 — IJOBIY SIGNALLAR (ular ham kerak: nima ishlayotgani ko'rinsin). */
export const rulePositive = ({ summary, directions, directionsPrev }) => {
  const out = [];
  const cp = summary?.contributionProfit;
  if (cp?.changePercent !== null && cp?.changePercent >= THRESHOLDS.positiveGrowthPercent) {
    out.push(signal({
      type: "profit_growth",
      severity: SEVERITY.POSITIVE,
      title: `Hissa foydasi ${pct(cp.changePercent)} o'sdi`,
      metric: "contribution_profit",
      currentValue: cp.current, previousValue: cp.previous,
      changeAmount: cp.change, changePercent: cp.changePercent,
      evidence: [
        ev("Hissa foydasi", { current: cp.current, previous: cp.previous, changePercent: cp.changePercent }),
        ev("Daromad", {
          current: summary?.revenue?.current ?? null,
          previous: summary?.revenue?.previous ?? null,
          changePercent: summary?.revenue?.changePercent ?? null,
        }),
      ],
      actionType: ACTION.NONE,
      actionLabel: "Foydalilikni ko'rish",
      actionTarget: { tab: "profitability" },
    }));
  }

  const prevById = new Map((directionsPrev?.items || []).map((d) => [d.courseId, d]));
  for (const d of directions?.items || []) {
    const prev = prevById.get(d.courseId);
    if (!prev || prev.contributionProfit <= 0) continue;
    const change = d.contributionProfit - prev.contributionProfit;
    const changePct = Math.round((change / prev.contributionProfit) * 1000) / 10;
    if (changePct < THRESHOLDS.positiveGrowthPercent) continue;
    out.push(signal({
      type: "direction_growth",
      severity: SEVERITY.POSITIVE,
      title: `"${d.name}" hissa foydasi ${pct(changePct)} o'sdi`,
      entityType: "course", entityId: d.courseId, entityName: d.name,
      metric: "contribution_profit",
      currentValue: d.contributionProfit, previousValue: prev.contributionProfit,
      changeAmount: change, changePercent: changePct,
      evidence: [
        ev("Hissa foydasi", {
          current: d.contributionProfit, previous: prev.contributionProfit, changePercent: changePct,
        }),
        ev("Daromad", { current: d.revenue, previous: prev.revenue }),
        ev("O'quvchilar", { current: d.students, previous: prev.students, unit: "ta" }),
      ],
      actionType: ACTION.NONE,
      actionLabel: "Yo'nalishni ko'rish",
      actionTarget: { tab: "profitability", subTab: "directions", filters: { courseId: d.courseId } },
    }));
  }
  return out;
};

/** Barcha qoidalar — tartib MUHIM emas, saralash keyin bo'ladi. */
export const ALL_RULES = Object.freeze([
  { key: "expense_growth", fn: ruleExpenseGrowth, payrollSensitive: false },
  { key: "collection", fn: ruleCollection, payrollSensitive: false },
  { key: "receivable_aging", fn: ruleReceivableAging, payrollSensitive: false },
  { key: "budget_overspend", fn: ruleBudgetOverspend, payrollSensitive: false },
  { key: "discount_anomaly", fn: ruleDiscountAnomaly, payrollSensitive: false },
  { key: "refund_anomaly", fn: ruleRefundAnomaly, payrollSensitive: false },
  { key: "direction_risk", fn: ruleDirectionRisk, payrollSensitive: false },
  // MAOSH: bu qoida faqat ruxsati borlarga.
  { key: "teacher_risk", fn: ruleTeacherRisk, payrollSensitive: true },
  { key: "room_capacity", fn: ruleRoomCapacity, payrollSensitive: false },
  { key: "concentration", fn: ruleConcentration, payrollSensitive: false },
  { key: "positive", fn: rulePositive, payrollSensitive: false },
]);
