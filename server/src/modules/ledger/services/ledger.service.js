import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import OpeningBalance from "../../../models/openingBalance.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import DepositTransaction from "../../../models/depositTransaction.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import StaffPayroll from "../../../models/staffPayroll.model.js";
import StaffSalaryTransaction from "../../../models/staffSalaryTransaction.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { userBranchCondition } from "../../../helpers/branchContext.helper.js";
import { partyAmount } from "../../openingBalance/services/openingBalance.service.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SHAXSIY MOLIYAVIY TARIX (LEDGER) - "bu balans QAYERDAN chiqdi?"
 * ══════════════════════════════════════════════════════════════════════
 *
 * ─── BU O'QISH MODELI (read model). YANGI JADVAL EMAS. ───
 *
 * Ledger hech narsa SAQLAMAYDI va hech narsa YOZMAYDI. U mavjud
 * hujjatlarni (oylik plan, to'lov, depozit, maosh qatori) bitta ishora
 * qoidasiga keltirib, sana bo'yicha saralaydi va yugurib boruvchi
 * balansni hisoblaydi.
 *
 * NEGA ALOHIDA "balances" JADVALI QILINMADI: balans ikkinchi joyda
 * saqlanganida u MUQARRAR eskiradi - to'lov qabul qilinganda biri
 * kamayadi, ikkinchisi qolib ketadi va qaysi biri haqiqat ekani
 * noma'lum bo'ladi. Bu yerda haqiqat bitta: MANBA HUJJATLAR. Balans
 * ulardan HAR SAFAR qayta hisoblanadi, ya'ni u eskira olmaydi.
 *
 * Shu sababdan balansni "qo'lda o'zgartirish" imkoniyati YO'Q - yozib
 * bo'ladigan maydon umuman mavjud emas. Balansni o'zgartirishning
 * yagona yo'li - tranzaksiya yaratish.
 *
 * ─── ISHORA QOIDASI (butun fayl bo'ylab bitta) ───
 *   +X = MARKAZ shu shaxsga X qarzdor
 *   -X = SHAXS markazga X qarzdor
 *
 * ─── DEPOZIT: NEGA "qoplash" QATORI YO'Q ───
 * O'quvchi depozitiga tushgan pul KIRIM paytida (+) hisoblanadi. Keyin
 * u oylik qarzga qoplanganda pul markaz ichida bir cho'ntakdan
 * ikkinchisiga o'tadi - o'quvchi bilan markaz o'rtasidagi SOF holat
 * o'zgarmaydi. Shuning uchun:
 *   • DepositTransaction(topup)              → +
 *   • DepositTransaction(withdraw)           → −
 *   • PaymentTransaction(source: "deposit")  → hisobga OLINMAYDI
 *   • DepositTransaction(refund)             → hisobga OLINMAYDI
 * Aks holda 300k depozit + 300k qoplama = +600k bo'lib, o'quvchi bir
 * marta bergan pul balansda ikki marta ko'rinardi.
 *
 * ─── BOSHLANG'ICH QOLDIQ: NEGA MATERIALIZATSIYA QATORLARI CHIQARIB
 *     TASHLANADI ───
 * Boshlang'ich qoldiq mavjud mexanizmga "sintetik" hujjat sifatida
 * yoziladi (isOpening bayrog'i bilan). Ledger esa uni OpeningBalance
 * hujjatining O'ZIDAN oladi. Ikkalasini ham sanasak - ikki baravar.
 * Manba sifatida aynan langar hujjat tanlandi, chunki u
 * materializatsiya bo'lmaganda ham (guruh kutayotgan o'quvchi) mavjud
 * va balans o'sha zahoti to'g'ri chiqadi.
 */

/**
 * FILIAL BO'YICHA FILTR ATAYLAB YO'Q (qatorlar darajasida).
 *
 * Ko'lam BIR MARTA, ODAM darajasida tekshiriladi (userBranchCondition) -
 * begona filial xodimining hisobi umuman ochilmaydi. Lekin hisob OCHILGACH
 * u TO'LIQ ko'rsatiladi.
 *
 * Sababi: "bu odamga qancha qarzmiz?" degan savolning filialga bo'lingan
 * javobi YO'Q. O'qituvchi ikki filialda dars bersa, uning bir filialdagi
 * maoshini yashirib qolgan balans - noto'g'ri balans, va undan kelib
 * chiqib to'langan pul ham noto'g'ri bo'lardi.
 */
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const notDeleted = { isDeleted: { $ne: true } };

// Qator turlari - UI shu kalitlar bo'yicha ikonka/rang tanlaydi.
export const LEDGER_TYPES = {
  OPENING: "opening", // boshlang'ich qoldiq
  CHARGE: "charge", // o'quvchiga hisoblangan oylik
  ACCRUAL: "accrual", // xodim/o'qituvchiga hisoblangan maosh
  PAYMENT_IN: "payment_in", // markazga kirim (o'quvchi to'ladi)
  PAYMENT_OUT: "payment_out", // markazdan chiqim (maosh berildi)
  DEPOSIT_IN: "deposit_in", // depozitga to'ldirish
  DEPOSIT_OUT: "deposit_out", // depozitdan qaytarish
  ADJUSTMENT: "adjustment", // korreksiya (write-off, ushlanma...)
};

/** Oy raqamidan davr yorlig'i: 2026-05 → "05.2026". */
const periodLabel = (year, month) =>
  `${String(month).padStart(2, "0")}.${year}`;

/** Oyning oxirgi kuni - hisoblangan (accrual) qatorlar shu sanaga tushadi. */
const periodEndDate = (year, month) => new Date(Date.UTC(year, month, 0));

/**
 * Boshlang'ich qoldiq qatori. Har uch rol uchun bir xil ko'rinadi -
 * farq faqat izohda.
 */
const openingRow = (ob) => {
  const amount = partyAmount(ob);
  if (!amount) return null;
  return {
    type: LEDGER_TYPES.OPENING,
    // Sana: qoldiq tegishli davrning OXIRI. Bu qator ledgerda HAR DOIM
    // birinchi turishi kerak, shuning uchun saralashda alohida ustunlik
    // ham beriladi (sortKey) - bir kunda yozilgan boshqa qator uni
    // yuqoriga itarib yubormasin.
    date: periodEndDate(ob.year, ob.month),
    sortKey: 0,
    period: periodLabel(ob.year, ob.month),
    amount,
    title: "Boshlang'ich qoldiq",
    note:
      ob.note ||
      (amount > 0
        ? "Tizimga o'tishdan oldingi qoldiq - markaz qarzdor"
        : "Tizimga o'tishdan oldingi qoldiq - shaxs qarzdor"),
    // Materializatsiya kutayotgan bo'lsa UI ogohlantirish ko'rsatadi:
    // qarz balansda bor, lekin qarzdorlar ro'yxatida hali yo'q.
    pending: !ob.materializedAt,
    pendingReason: ob.pendingReason || "",
    refId: String(ob._id),
  };
};

// ─────────────────────────────── O'QUVCHI ───────────────────────────────

const studentRows = async (userId) => {
  const sid = toObjectId(userId);

  const [plans, payments, depositTxns] = await Promise.all([
    // Oylik planlar. isOpening CHIQARIB TASHLANADI - u boshlang'ich
    // qoldiq qatorining materializatsiyasi (yuqoridagi izohga qarang).
    StudentPayment.find(
      { student: sid, isOpening: { $ne: true } },
      {
        year: 1,
        month: 1,
        expectedAmount: 1,
        writtenOff: 1,
        writeOffAmount: 1,
        writeOffAt: 1,
        group: 1,
      },
    )
      .populate("group", { name: 1 })
      .lean(),

    // To'lovlar. source="deposit" HISOBGA OLINMAYDI (ichki ko'chirish).
    //
    // Shart `$ne: "deposit"` shaklida, `source: "direct"` EMAS: `source`
    // maydoni keyinroq qo'shilgan va undan oldingi hujjatlarda umuman
    // yo'q. Tenglik bilan qidirilganda o'sha eski to'lovlar tushmay
    // qolib, balans o'quvchi zarariga - to'lamagandek - chiqardi.
    PaymentTransaction.find(
      { student: sid, source: { $ne: "deposit" }, ...notDeleted },
      { amount: 1, paidAt: 1, method: 1, note: 1, year: 1, month: 1 },
    ).lean(),

    // Depozit: faqat HAQIQIY pul harakati (topup/withdraw).
    // isOpening topup ham chiqariladi - u boshlang'ich qoldiq qatori.
    DepositTransaction.find(
      {
        student: sid,
        type: { $in: ["topup", "withdraw"] },
        isOpening: { $ne: true },
        ...notDeleted,
      },
      { amount: 1, type: 1, paidAt: 1, method: 1, note: 1 },
    ).lean(),
  ]);

  const rows = [];

  for (const p of plans) {
    // HISOBLANGAN OYLIK: o'quvchi markazga qarzdor bo'ladi → manfiy.
    if (p.expectedAmount) {
      rows.push({
        type: LEDGER_TYPES.CHARGE,
        date: periodEndDate(p.year, p.month),
        period: periodLabel(p.year, p.month),
        amount: -p.expectedAmount,
        title: `Oylik to'lov${p.group?.name ? ` - ${p.group.name}` : ""}`,
        note: "",
        refId: String(p._id),
      });
    }
    // HISOBDAN CHIQARISH (write-off): qarz undirilmaydi deb qaror
    // qilingan. O'quvchining majburiyati kamayadi → musbat.
    // Bu KORREKSIYA - to'lov emas, shuning uchun alohida tur.
    if (p.writtenOff && p.writeOffAmount) {
      rows.push({
        type: LEDGER_TYPES.ADJUSTMENT,
        date: p.writeOffAt || periodEndDate(p.year, p.month),
        period: periodLabel(p.year, p.month),
        amount: p.writeOffAmount,
        title: "Qarz hisobdan chiqarildi",
        note: "Undirilmaydigan qarz sifatida yopildi",
        refId: String(p._id),
      });
    }
  }

  for (const t of payments) {
    rows.push({
      type: LEDGER_TYPES.PAYMENT_IN,
      date: t.paidAt,
      period: periodLabel(t.year, t.month),
      amount: t.amount,
      title: t.method === "card" ? "To'lov (karta)" : "To'lov (naqd)",
      note: t.note || "",
      refId: String(t._id),
    });
  }

  for (const d of depositTxns) {
    const isIn = d.type === "topup";
    rows.push({
      type: isIn ? LEDGER_TYPES.DEPOSIT_IN : LEDGER_TYPES.DEPOSIT_OUT,
      date: d.paidAt,
      period: "",
      amount: isIn ? d.amount : -d.amount,
      title: isIn ? "Depozitga to'ldirish" : "Depozitdan qaytarish",
      note: d.note || "",
      refId: String(d._id),
    });
  }

  return rows;
};

// ────────────────────────────── O'QITUVCHI ──────────────────────────────

const TEACHER_KIND_LABELS = {
  group: "Guruh maoshi",
  base: "Fiksa oylik",
  bonus: "Mukofot",
  deduction: "Ushlanma",
};

const teacherRows = async (userId) => {
  const tid = toObjectId(userId);

  const [salaries, payouts] = await Promise.all([
    // TeacherSalary'da softDelete YO'Q (model izohiga qarang) - shuning
    // uchun bu yerda isDeleted filtri ham yo'q.
    TeacherSalary.find(
      { teacher: tid, isOpening: { $ne: true } },
      { year: 1, month: 1, expectedAmount: 1, kind: 1, reason: 1, group: 1 },
    )
      .populate("group", { name: 1 })
      .lean(),

    SalaryTransaction.find(
      { teacher: tid, ...notDeleted },
      { amount: 1, paidAt: 1, method: 1, note: 1, year: 1, month: 1 },
    ).lean(),
  ]);

  const rows = [];

  for (const s of salaries) {
    if (!s.expectedAmount) continue;
    // expectedAmount ALLAQACHON ishorali: ushlanma (deduction) manfiy
    // saqlanadi. Shuning uchun bu yerda ishora o'zgartirilmaydi -
    // hisoblangan maosh markazning qarzini oshiradi (+), ushlanma esa
    // kamaytiradi (−) va ikkalasi bir xil yo'l bilan qo'shiladi.
    const isDeduction = s.expectedAmount < 0;
    rows.push({
      type: isDeduction ? LEDGER_TYPES.ADJUSTMENT : LEDGER_TYPES.ACCRUAL,
      date: periodEndDate(s.year, s.month),
      period: periodLabel(s.year, s.month),
      amount: s.expectedAmount,
      title: `${TEACHER_KIND_LABELS[s.kind] || "Maosh"}${
        s.group?.name ? ` - ${s.group.name}` : ""
      }`,
      note: s.reason || "",
      refId: String(s._id),
    });
  }

  for (const t of payouts) {
    rows.push({
      type: LEDGER_TYPES.PAYMENT_OUT,
      date: t.paidAt,
      period: periodLabel(t.year, t.month),
      amount: -t.amount,
      title: t.method === "card" ? "Maosh to'landi (karta)" : "Maosh to'landi (naqd)",
      note: t.note || "",
      refId: String(t._id),
    });
  }

  return rows;
};

// ──────────────────────────────── XODIM ────────────────────────────────

const staffRows = async (userId) => {
  const eid = toObjectId(userId);

  const [payrolls, payouts] = await Promise.all([
    StaffPayroll.find(
      { employee: eid },
      {
        year: 1,
        month: 1,
        finalAmount: 1,
        openingCreditTotal: 1,
        openingDebtApplied: 1,
      },
    ).lean(),

    StaffSalaryTransaction.find(
      { employee: eid, ...notDeleted },
      { amount: 1, paidAt: 1, method: 1, note: 1, year: 1, month: 1 },
    ).lean(),
  ]);

  const rows = [];

  for (const p of payrolls) {
    // BOSHLANG'ICH QOLDIQ QISMI AJRATIB TASHLANADI.
    //
    // finalAmount ichida boshlang'ich qoldiq allaqachon qatnashgan
    // (staffPayroll.service.js -> gross ga openingCreditTotal qo'shiladi,
    // undan openingDebtApplied ayriladi). Ledgerda esa qoldiq ALOHIDA
    // qator bo'lib turibdi - shuning uchun bu yerdan chiqarib
    // tashlanmasa, u ikki marta hisoblanardi.
    //
    // Natija = o'sha oyda HAQIQATAN ishlab topilgan summa.
    const earned =
      (p.finalAmount || 0) -
      (p.openingCreditTotal || 0) +
      (p.openingDebtApplied || 0);
    if (!earned) continue;
    rows.push({
      type: LEDGER_TYPES.ACCRUAL,
      date: periodEndDate(p.year, p.month),
      period: periodLabel(p.year, p.month),
      amount: earned,
      title: "Oylik maosh",
      note: "",
      refId: String(p._id),
    });
  }

  for (const t of payouts) {
    rows.push({
      type: LEDGER_TYPES.PAYMENT_OUT,
      date: t.paidAt,
      period: periodLabel(t.year, t.month),
      amount: -t.amount,
      title: t.method === "card" ? "Maosh to'landi (karta)" : "Maosh to'landi (naqd)",
      note: t.note || "",
      refId: String(t._id),
    });
  }

  return rows;
};

// ─────────────────────────────── UMUMIY YO'L ───────────────────────────────

const ROLE_BUILDERS = {
  [ROLES.STUDENT]: studentRows,
  [ROLES.TEACHER]: teacherRows,
};

/**
 * Shaxsning to'liq moliyaviy tarixi + joriy balansi.
 *
 * @returns {{
 *   user: object,
 *   openingBalance: number,
 *   currentBalance: number,
 *   rows: Array,
 *   summary: object
 * }}
 */
export const statementFor = async (
  userId,
  { from = null, to = null, ownProfile = false } = {},
) => {
  // FILIAL KO'LAMI: boshqa filial xodimining moliyasi ochilmasin.
  //
  // O'Z profilida chetlab o'tiladi: odam har doim o'z balansini
  // ko'rishi kerak, aktiv filial konteksti esa (masalan o'qituvchi
  // boshqa filialga vaqtincha biriktirilgan bo'lsa) uni o'zidan
  // ajratib qo'yishi mumkin edi.
  const branchCond = ownProfile ? null : userBranchCondition();
  const uid = toObjectId(userId);
  const user = await User.findOne(
    branchCond ? { _id: uid, $and: [branchCond] } : { _id: uid },
    {
      firstName: 1,
      lastName: 1,
      username: 1,
      role: 1,
      hiredAt: 1,
      enrolledAt: 1,
      homeBranchId: 1,
    },
  ).lean();
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");

  const ob = await OpeningBalance.findOne({ user: uid }).lean();

  // Rol bo'yicha quruvchi. O'qituvchi ham, o'quvchi ham EMAS bo'lsa
  // (direktor, administrator, buxgalter...) - xodim hisobi.
  const build = ROLE_BUILDERS[user.role] || staffRows;
  const rows = await build(uid);

  const opening = ob ? openingRow(ob) : null;
  if (opening) rows.push(opening);

  // SARALASH: sana → ustunlik → tur.
  //
  // Bir kunda hisoblangan oylik va o'sha kungi to'lov birga tushadi;
  // qaysi biri oldin turishi yugurib boruvchi balansning oraliq
  // qiymatiga ta'sir qiladi (yakuniy balansga emas). Hisoblangan
  // majburiyat OLDIN, to'lov KEYIN turadi - "avval qarz paydo bo'ldi,
  // keyin yopildi" degan tabiiy o'qish shu.
  const typeOrder = {
    [LEDGER_TYPES.OPENING]: 0,
    [LEDGER_TYPES.CHARGE]: 1,
    [LEDGER_TYPES.ACCRUAL]: 1,
    [LEDGER_TYPES.ADJUSTMENT]: 2,
    [LEDGER_TYPES.DEPOSIT_IN]: 3,
    [LEDGER_TYPES.DEPOSIT_OUT]: 3,
    [LEDGER_TYPES.PAYMENT_IN]: 4,
    [LEDGER_TYPES.PAYMENT_OUT]: 4,
  };

  rows.sort((a, b) => {
    const ka = a.sortKey ?? 1;
    const kb = b.sortKey ?? 1;
    if (ka !== kb) return ka - kb;
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
  });

  // YUGURIB BORUVCHI BALANS. Har qatorda "shu amaldan KEYIN balans
  // qanday bo'ldi" - foydalanuvchi aynan shu ustundan balansning
  // qanday shakllanganini o'qiydi.
  let running = 0;
  for (const r of rows) {
    running += r.amount;
    r.balanceAfter = running;
  }

  const currentBalance = running;

  // FILTR SARALASHDAN KEYIN qo'llanadi: `balanceAfter` to'liq tarixdan
  // hisoblanishi shart, aks holda oraliq ko'rinishda balans noldan
  // boshlanib, yolg'on raqam chiqarardi.
  let visible = rows;
  if (from || to) {
    // Yaroqsiz sana (NaN) e'tiborsiz qoldiriladi: aks holda har qanday
    // taqqoslash `false` bo'lib, ro'yxat jimgina BO'SH chiqardi va bu
    // "tranzaksiya yo'q" degan yolg'on xulosaga olib kelardi.
    const ms = (v) => {
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? null : t;
    };
    const fromMs = (from && ms(from)) ?? -Infinity;
    const toMs = (to && ms(to)) ?? Infinity;
    visible = rows.filter((r) => {
      const t = new Date(r.date).getTime();
      return t >= fromMs && t <= toMs;
    });
  }

  const sumOf = (pred) =>
    rows.filter(pred).reduce((s, r) => s + r.amount, 0);

  return {
    user,
    openingBalance: opening?.amount || 0,
    currentBalance,
    rows: visible,
    summary: {
      // Hisoblangan majburiyatlar (o'quvchida qarz, xodimda maosh).
      accrued: sumOf(
        (r) => r.type === LEDGER_TYPES.CHARGE || r.type === LEDGER_TYPES.ACCRUAL,
      ),
      // Haqiqiy pul harakati.
      paid: sumOf(
        (r) =>
          r.type === LEDGER_TYPES.PAYMENT_IN ||
          r.type === LEDGER_TYPES.PAYMENT_OUT ||
          r.type === LEDGER_TYPES.DEPOSIT_IN ||
          r.type === LEDGER_TYPES.DEPOSIT_OUT,
      ),
      adjustments: sumOf((r) => r.type === LEDGER_TYPES.ADJUSTMENT),
      rowCount: rows.length,
      // Boshlang'ich qoldiq hali mavjud mexanizmga yozilmagan bo'lsa,
      // qarzdorlar ro'yxati bilan ledger vaqtincha farq qiladi.
      openingPending: Boolean(opening?.pending),
    },
  };
};
