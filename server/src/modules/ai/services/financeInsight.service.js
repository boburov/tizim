import Branch from "../../../models/branch.model.js";
import { collectFinanceSignals } from "../signals/finance.signal.js";
import {
  buildFactors,
  weightedScore,
  severityFor,
  sampleConfidence,
  consistencyOf,
  zScore,
  norm,
  readMap,
} from "../scoring/common.scoring.js";
import { DEFAULT_THRESHOLDS } from "../../../models/aiConfig.model.js";
import { narrate } from "./narration.service.js";
import {
  buildInsight,
  closeStale,
  mkStats,
  writeIfConfident,
  fmtMoney,
} from "./insightWriter.service.js";
import { resolveConfig } from "./aiConfig.service.js";

// MOLIYA DETEKTORLARI - to'rtta, hammasi FILIAL darajasida:
//   1. overdue_payments       - muddati o'tgan to'lovlar yig'masi
//   2. revenue_forecast_drop  - keyingi oy daromadi pasayishi
//   3. expense_anomaly        - maosh xarajatining g'ayrioddiy sakrashi
//   4. cashflow_warning       - chiqim kirimdan oshib ketishi
//
// Filial darajasidagi insight'da subjectId = branchId. Dedup indeksi
// (subjectType, subjectId, kind) shu holda ham to'g'ri ishlaydi: filialda
// har turdan bitta ochiq insight bo'ladi va u har hisoblashda yangilanadi.
// Shuning uchun "15 ta to'lov kechikkan" har kuni yangi karta yaratmaydi -
// bitta karta o'z ichidagi sonni yangilaydi.

const FINANCE_KINDS = [
  "overdue_payments",
  "revenue_forecast_drop",
  "expense_anomaly",
  "cashflow_warning",
];

const monthLabel = (year, month) => {
  const names = [
    "yanvar", "fevral", "mart", "aprel", "may", "iyun",
    "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
  ];
  return `${names[month - 1]} ${year}`;
};

/**
 * DETEKTOR 1: muddati o'tgan to'lovlar.
 *
 * Bu BASHORAT EMAS - qayd etilgan fakt. Shuning uchun ishonch yuqori va
 * ball "qanchalik yomon" ni o'lchaydi, "qanchalik ehtimolli" ni emas.
 * Aynan shu sababdan chegaralar summa va muddat bo'yicha, ehtimol
 * bo'yicha emas.
 */
const detectOverdue = ({ overdue, forecast, thresholds, branchName }) => {
  if (overdue.periods === 0) return null;

  // Muddati o'tgan qarz oylik kutilgan daromadning qanchasi - MUTLAQ
  // summa emas, ULUSH. 5 mln so'm kichik markazda halokat, kattasida
  // normal. Ulush ikkalasida ham to'g'ri o'qiladi.
  const monthlyBase = forecast.currentExpected || 1;
  const debtRatio = overdue.amount / monthlyBase;

  const factors = buildFactors([
    {
      key: "overdueAmount",
      label: "Muddati o'tgan summa",
      value: overdue.amount,
      unit: "so'm",
      // Oylik daromadning 30% i qarzda = to'liq signal.
      normalized: norm(debtRatio, 0.3),
      weight: 0.4,
    },
    {
      key: "overdueStudents",
      label: "Qarzdor o'quvchilar",
      value: overdue.students,
      unit: "ta",
      normalized: norm(overdue.students, 25),
      weight: 0.25,
    },
    {
      key: "oldestDebtDays",
      label: "Eng eski qarz muddati",
      value: overdue.maxDebtDays,
      unit: "kun",
      // 60 kun = to'liq signal: undan keyin qarz qaytishi ehtimoli keskin tushadi.
      normalized: norm(overdue.maxDebtDays, 60),
      weight: 0.2,
    },
    {
      key: "overduePeriods",
      label: "To'lanmagan davrlar",
      value: overdue.periods,
      unit: "ta",
      normalized: norm(overdue.periods, 40),
      weight: 0.15,
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: overdue.periods,
    minSample: 1,
    fullSample: 10,
  });

  const expectedImpact = {
    amount: overdue.amount,
    currency: "UZS",
    label: `${fmtMoney(overdue.amount)} so'm yig'ilmagan`,
  };

  return {
    kind: "overdue_payments",
    subjectLabel: branchName,
    title: `${overdue.periods} ta to'lov muddati o'tgan — ${fmtMoney(overdue.amount)} so'm`,
    severity: severityFor(score, thresholds),
    score,
    confidence,
    factors,
    expectedImpact,
    sourceRefs: [
      {
        model: "StudentPayment",
        ids: overdue.ids,
        total: overdue.periods,
        href: "/owner/students/qarzdorlar",
      },
    ],
    recommendedActions: [
      {
        key: "call_debtors",
        label: `${overdue.students} qarzdor o'quvchi bilan bog'laning`,
        dueInDays: 3,
      },
      ...(overdue.maxDebtDays > 60
        ? [
            {
              key: "review_writeoff",
              label: `${overdue.maxDebtDays} kunlik qarzni hisobdan chiqarishni ko'rib chiqing`,
              dueInDays: 14,
            },
          ]
        : []),
    ],
    narration: narrate({
      headline: `${overdue.students} o'quvchida jami ${fmtMoney(overdue.amount)} so'm muddati o'tgan qarz bor (${overdue.periods} ta to'lov davri).`,
      factors,
      expectedImpact,
      confidence,
      stance: "risk",
    }),
  };
};

/**
 * DETEKTOR 2: daromad pasayishi bashorati.
 *
 * KOGORTLI ROLL-FORWARD (finance.signal.js dagi izohga qarang): bashorat
 * bugun o'qiyotgan aniq o'quvchilar va ularning ketish ballaridan chiqadi.
 * Shuning uchun "8% pasayadi" degan son TUSHUNTIRILADI: "142 o'quvchidan
 * 11 tasi xavf ostida, ularning oylik to'lovi 3.2 mln so'm".
 */
const detectForecastDrop = ({ forecast, collected, thresholds, branchName }) => {
  // Pasayish sezilarli bo'lmasa insight yaratilmaydi: 3% dan kam farq
  // bashorat xatosi doirasida va uni ko'rsatish soxta signal bo'lardi.
  if (forecast.deltaRatio > -0.03) return null;
  if (!forecast.currentExpected) return null;

  const dropPct = Math.abs(forecast.deltaRatio);

  const factors = buildFactors([
    {
      key: "forecastDrop",
      label: "Kutilayotgan pasayish",
      value: Math.round(dropPct * 100),
      unit: "%",
      // 15% pasayish = to'liq signal.
      normalized: norm(dropPct, 0.15),
      weight: 0.45,
    },
    {
      key: "churnLoss",
      label: "Ketish xavfidagi summa",
      value: Math.round(forecast.atRisk),
      unit: "so'm",
      normalized: norm(forecast.atRisk / forecast.currentExpected, 0.2),
      weight: 0.3,
    },
    {
      key: "riskyStudents",
      label: "Xavf ostidagi o'quvchilar",
      value: forecast.riskyStudents,
      unit: "ta",
      normalized: norm(forecast.riskyStudents / Math.max(1, forecast.activeStudents), 0.15),
      weight: 0.15,
    },
    {
      key: "collectionGap",
      label: "Tarixiy yig'ilmaganlik",
      value: Math.round((1 - forecast.collectionRate) * 100),
      unit: "%",
      normalized: norm(1 - forecast.collectionRate, 0.25),
      weight: 0.1,
    },
  ]);

  const score = weightedScore(factors);

  // Ishonch: yig'ish darajasi qancha oy ma'lumotiga tayanadi + tarixiy
  // daromad qanchalik barqaror. Sakroq daromadli filialda 8% bashorat
  // ma'nosiz va ishonch shuni aks ettirishi kerak.
  const confidence = sampleConfidence({
    observed: forecast.activeStudents,
    minSample: 10,
    fullSample: 80,
    consistency: consistencyOf(collected.slice(-6).map((m) => m.amount)),
  });

  const expectedImpact = {
    amount: Math.round(forecast.currentExpected - forecast.forecastGross),
    currency: "UZS",
    label: `Keyingi oy ${fmtMoney(forecast.currentExpected - forecast.forecastGross)} so'm kam kutilmoqda`,
  };

  const next = monthLabel(forecast.nextPeriod.year, forecast.nextPeriod.month);

  return {
    kind: "revenue_forecast_drop",
    subjectLabel: branchName,
    title: `${next} daromadi ${Math.round(dropPct * 100)}% pasayishi kutilmoqda`,
    severity: severityFor(score, thresholds),
    score,
    confidence,
    factors,
    expectedImpact,
    sourceRefs: [
      {
        model: "StudentPayment",
        ids: [],
        total: forecast.currentStudents,
        href: "/owner/finance",
      },
    ],
    recommendedActions: [
      {
        key: "work_churn_list",
        label: `Ketish xavfi ro'yxatidagi ${forecast.riskyStudents} o'quvchi bilan ishlang`,
        dueInDays: 7,
      },
      {
        key: "boost_enrollment",
        label: "Yangi yozilishlarni tezlashtirish uchun lidlar bilan ishlang",
        dueInDays: 14,
      },
    ],
    narration: narrate({
      headline:
        `${next} uchun bashorat: ${fmtMoney(forecast.forecastGross)} so'm — joriy oyning ` +
        `${fmtMoney(forecast.currentExpected)} so'midan ${Math.round(dropPct * 100)}% past. ` +
        `Hisob: ${forecast.activeStudents} faol o'quvchi, ulardan ${forecast.riskyStudents} tasi ketish xavfida.`,
      factors,
      expectedImpact,
      confidence,
      stance: "risk",
    }),
  };
};

/**
 * DETEKTOR 3: xarajat anomaliyasi.
 *
 * HALOL NOMLASH: bu "jami xarajat" emas, MAOSH xarajati. Kodbazada
 * xarajat kategoriyasi modeli yo'q (ijara/kommunal/marketing yozilmaydi),
 * yozilgan yagona chiqim oqimi - SalaryTransaction. "Marketing +18%"
 * kabi tavsiya berish uchun avval ExpenseCategory modeli kerak.
 * Insight matni ham aynan "maosh xarajati" deydi - owner nimaga
 * qarayotganini aniq bilishi kerak.
 */
const detectExpenseAnomaly = ({ expense, thresholds, branchName, now }) => {
  if (expense.length < 4) return null;

  // Joriy oy TUGAMAGAN, shuning uchun tugagan oxirgi oy tekshiriladi.
  // Yarim oy ma'lumotini to'liq oylar bilan taqqoslash har oy boshida
  // "xarajat keskin tushdi" degan soxta anomaliya berardi.
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const closed = expense.filter((m) => m.key !== currentKey);
  if (closed.length < 4) return null;

  const latest = closed[closed.length - 1];
  const history = closed.slice(0, -1).map((m) => m.amount);
  const { z, mean, stdev } = zScore(latest.amount, history);

  // |z| > 2 - klassik anomaliya chegarasi. Undan past - normal tebranish.
  if (Math.abs(z) < 2 || mean == null || !stdev) return null;

  const delta = latest.amount - mean;
  const factors = buildFactors([
    {
      key: "expenseZScore",
      label: "Anomaliya kuchi",
      value: Number(z.toFixed(1)),
      unit: "σ",
      normalized: norm(Math.abs(z), 4),
      weight: 0.6,
      direction: z > 0 ? "bad" : "good",
    },
    {
      key: "expenseDelta",
      label: "O'rtachadan farq",
      value: Math.round(delta),
      unit: "so'm",
      normalized: norm(Math.abs(delta) / Math.max(1, mean), 0.5),
      weight: 0.4,
      direction: z > 0 ? "bad" : "good",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: history.length,
    minSample: 3,
    fullSample: 12,
    consistency: consistencyOf(history),
  });

  const direction = z > 0 ? "oshdi" : "tushdi";
  const label = monthLabel(latest.year, latest.month);

  return {
    kind: "expense_anomaly",
    subjectLabel: branchName,
    title: `${label} maosh xarajati odatdagidan keskin ${direction}`,
    // O'sish - kuzatuv, tushish - past ustuvorlik: kamaygan xarajat
    // muammo bo'lishi shart emas (o'qituvchi kam ishlagan bo'lishi mumkin),
    // lekin bilish kerak.
    severity: z > 0 ? severityFor(score, thresholds) : "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: Math.abs(Math.round(delta)),
      currency: "UZS",
      label: `O'rtachadan ${fmtMoney(Math.abs(delta))} so'm farq`,
    },
    sourceRefs: [
      {
        model: "SalaryTransaction",
        ids: [],
        total: latest.count,
        href: "/owner/teachers/maoshlar",
      },
    ],
    recommendedActions: [
      {
        key: "review_salary_month",
        label: `${label} maosh to'lovlarini tekshiring (${latest.count} tranzaksiya)`,
        dueInDays: 7,
      },
    ],
    narration: narrate({
      headline:
        `${label} da maosh xarajati ${fmtMoney(latest.amount)} so'm bo'ldi — ` +
        `oxirgi ${history.length} oy o'rtachasi ${fmtMoney(mean)} so'm. ` +
        `Bu ${Math.abs(z).toFixed(1)} standart og'ish farq.`,
      factors,
      confidence,
      stance: "watch",
    }),
  };
};

/**
 * DETEKTOR 4: pul oqimi ogohlantirishi.
 * Joriy oyda chiqim kirimga yaqinlashsa yoki oshsa - kassa muammosi.
 */
const detectCashflowWarning = ({ cashflow, thresholds, branchName }) => {
  if (cashflow.inflow <= 0) return null;
  const ratio = cashflow.outflow / cashflow.inflow;
  // 80% dan past - normal ish rejimi.
  if (ratio < 0.8) return null;

  const factors = buildFactors([
    {
      key: "outflowRatio",
      label: "Chiqim / kirim nisbati",
      value: Math.round(ratio * 100),
      unit: "%",
      // 130% = to'liq signal (chiqim kirimdan 1.3 barobar ko'p).
      normalized: norm(ratio, 1.3),
      weight: 0.6,
    },
    {
      key: "cashflowNet",
      label: "Joriy qoldiq",
      value: Math.round(cashflow.net),
      unit: "so'm",
      normalized: cashflow.net < 0 ? 1 : norm(1 - cashflow.net / cashflow.inflow, 1),
      weight: 0.4,
      direction: cashflow.net < 0 ? "bad" : "neutral",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: Math.round(cashflow.monthProgress * 30),
    minSample: 5,
    fullSample: 20,
  });

  return {
    kind: "cashflow_warning",
    subjectLabel: branchName,
    title:
      cashflow.net < 0
        ? `Joriy oyda chiqim kirimdan ${fmtMoney(Math.abs(cashflow.net))} so'm ko'p`
        : `Chiqim kirimning ${Math.round(ratio * 100)}% iga yetdi`,
    severity: severityFor(score, thresholds),
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: cashflow.net < 0 ? Math.abs(Math.round(cashflow.net)) : 0,
      currency: "UZS",
      label:
        cashflow.net < 0
          ? `Kamomad: ${fmtMoney(Math.abs(cashflow.net))} so'm`
          : `Qoldiq: ${fmtMoney(cashflow.net)} so'm`,
    },
    sourceRefs: [
      { model: "PaymentTransaction", ids: [], total: 0, href: "/owner/finance" },
    ],
    recommendedActions: [
      {
        key: "accelerate_collection",
        label: "Qarz yig'ishni tezlashtiring — kirimni oshirish eng tez yo'l",
        dueInDays: 5,
      },
      {
        key: "review_pending_expenses",
        label: "Tasdiqlanmagan chiqim so'rovlarini ko'rib chiqing",
        dueInDays: 3,
      },
    ],
    narration: narrate({
      headline:
        `Joriy oyda kirim ${fmtMoney(cashflow.inflow)} so'm, chiqim ${fmtMoney(cashflow.outflow)} so'm ` +
        `(oyning ${Math.round(cashflow.monthProgress * 100)}% i o'tdi).`,
      factors,
      confidence,
      stance: "risk",
    }),
  };
};

/**
 * Bitta filial uchun moliya insight'larini qayta hisoblaydi.
 *
 * TARTIB MUHIM: bu detektor o'quvchi churn ballaridan foydalanadi
 * (revenueForecast ochiq student_churn_risk insight'larini o'qiydi),
 * shuning uchun orkestrator uni o'quvchi detektoridan KEYIN ishga
 * tushirishi shart. Aks holda bashorat kechagi ballarga tayanadi.
 */
export const recomputeFinanceInsights = async (branchId, now = new Date()) => {
  const config = await resolveConfig(branchId);
  const thresholds = readMap(config.thresholds, DEFAULT_THRESHOLDS);

  const branch = await Branch.findById(branchId).select("name").lean();
  const branchName = branch?.name || "Filial";

  const signals = await collectFinanceSignals(branchId, now);

  const stats = {
    overdue: mkStats(),
    forecast: mkStats(),
    expense: mkStats(),
    cashflow: mkStats(),
  };

  const candidates = [
    { stat: "overdue", found: detectOverdue({ ...signals, thresholds, branchName }) },
    {
      stat: "forecast",
      found: detectForecastDrop({ ...signals, thresholds, branchName }),
    },
    {
      stat: "expense",
      found: detectExpenseAnomaly({ ...signals, thresholds, branchName, now }),
    },
    {
      stat: "cashflow",
      found: detectCashflowWarning({ ...signals, thresholds, branchName }),
    },
  ];

  const stillOpen = new Set();
  for (const { stat, found } of candidates) {
    if (!found) continue;
    await writeIfConfident({
      // Filial darajasidagi insight - subyekt filialning O'ZI.
      candidate: buildInsight({ branchId, subjectId: branchId, now, ...found }),
      confidenceFloor: config.confidenceFloor,
      stats: stats[stat],
      stillOpen: null,
    });
    stillOpen.add(`${found.kind}`);
  }

  // Yopish: bu yerda subyekt bo'yicha emas, TUR bo'yicha yopiladi -
  // filialda har turdan bitta insight bo'ladi, shuning uchun "endi
  // signal bermayotgan turlar" yopilishi kerak.
  const closedKinds = FINANCE_KINDS.filter((k) => !stillOpen.has(k));
  for (const kind of closedKinds) {
    const closed = await closeStale(branchId, [kind], new Set(), now);
    const statKey =
      kind === "overdue_payments"
        ? "overdue"
        : kind === "revenue_forecast_drop"
          ? "forecast"
          : kind === "expense_anomaly"
            ? "expense"
            : "cashflow";
    stats[statKey].closed = closed;
  }

  return { ...stats, forecastSnapshot: signals.forecast, overdueSnapshot: signals.overdue };
};
