import OpeningBalance, {
  OPENING_MAX_AMOUNT,
} from "../../../models/openingBalance.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import StaffPayrollAdjustment from "../../../models/staffPayrollAdjustment.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { localTodayMidnight, toUtcMidnight } from "../../../helpers/attendance.helper.js";
import {
  resolveBranchFromGroup,
  branchFilter,
} from "../../../helpers/branchContext.helper.js";
import * as depositService from "../../deposits/services/deposit.service.js";
import * as staffPayrollService from "../../staffPayroll/services/staffPayroll.service.js";

/**
 * BOSHLANG'ICH QOLDIQNI MAVJUD MEXANIZMGA O'TKAZISH (materializatsiya).
 *
 * ─── ASOSIY QOIDA ───
 * Bu servis YANGI balans tizimi qurmaydi. U boshlang'ich summani mavjud
 * hujjatlarga aylantiradi (depozit / oylik plan / maosh qatori), shundan
 * keyin kundalik oqim - to'lov qabul qilish, avto-qoplash, qarzdorlar
 * ro'yxati - O'ZGARISHSIZ ishlaydi. Ikkinchi "balans" jadvali bo'lganida
 * to'lov kelganda bittasi kamayib, ikkinchisi eskirib qolardi.
 *
 * ─── ISHORA QOIDASI (shaxs nuqtai nazaridan) ───
 *   +X = MARKAZ shu shaxsga X qarzdor
 *   -X = SHAXS markazga X qarzdor
 * Barcha rollar uchun bir xil. Eski yozuvlar boshqa qoidada
 * (signConvention: "flow") - o'qishda partyAmount() ishlatiladi.
 *
 * ─── XATOLIK YO'NALISHI (eng muhim qaror) ───
 * Langar hujjat (OpeningBalance) materializatsiyadan OLDIN yoziladi.
 * Jarayon o'rtada uzilsa natija: langar bor, pul yozilmagan.
 *   • Qayta import PULNI IKKI MARTA YOZMAYDI (unique indeks bloklaydi).
 *   • Yozilmay qolgani `materializedAt: null` bilan KO'RINIB turadi va
 *     repairPending() bilan tuzatiladi.
 * Teskari tartibda (avval pul, keyin langar) uzilish IKKI BARAVAR
 * YOZISHGA olib kelardi - va buni keyin topib bo'lmasdi. Kam yozib
 * ogohlantirish, ko'p yozib jim turishdan xavfsizroq.
 */

// Import oldidan ogohlantirish beriladigan chegara (xato emas, ogohlantirish).
// Nol xatosi (300 000 → 3 000 000) aynan shu oraliqda ushlanadi.
export const OPENING_WARN_AMOUNT = 20_000_000;

const prevPeriod = (year, month) =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

const periodOfDate = (d) => ({
  year: d.getUTCFullYear(),
  month: d.getUTCMonth() + 1,
});

/**
 * BOSHLANG'ICH QARZ QAYSI OYGA YOZILADI.
 *
 * Javob HAR DOIM "eng eski oydan ham oldingi oy" bo'lishi shart. Sababi
 * to'lovni taqsimlash mantig'i: transaction.service.js -> buildAllocationOrder
 * va deposit.service.js -> autoApply ikkalasi ham {year:1, month:1} bo'yicha
 * saralaydi va ENG ESKI qarzdan boshlab yopadi. Boshlang'ich qarz eng eski
 * bo'lmasa, o'quvchi to'lagan pul avval YANGI oylarni yopib, eski qarz
 * abadiy osilib qolardi.
 */
export const resolveOpeningPeriod = async ({ student, group, joinedAt }) => {
  // 1) Mavjud eng eski oylik plan (guruhga qo'shilish allaqachon
  //    o'tgan oylarni yaratgan bo'lishi mumkin - qarang
  //    groups.service.js -> ensureFinanceForMembershipRange).
  let anchor = null;
  if (student && group) {
    const oldest = await StudentPayment.findOne(
      { student, group },
      { year: 1, month: 1 },
    )
      .sort({ year: 1, month: 1 })
      .lean();
    if (oldest) anchor = { year: oldest.year, month: oldest.month };
  }

  // 2) Plan hali yo'q bo'lsa - a'zolik sanasidan.
  if (!anchor && joinedAt) {
    const d = toUtcMidnight(joinedAt);
    if (d) anchor = periodOfDate(d);
  }

  // 3) Ikkalasi ham yo'q - bugundan.
  if (!anchor) anchor = periodOfDate(localTodayMidnight());

  return prevPeriod(anchor.year, anchor.month);
};

/**
 * Rol + ishoradan materializatsiya turini aniqlaydi.
 *
 * Kirish summasi HAR DOIM "party" konvensiyasida (+ = markaz qarzdor),
 * shuning uchun qoida rolga qarab o'zgarmaydi: musbat → credit (biz
 * qarzmiz), manfiy → debt (u qarz).
 */
export const resolveKind = (role, amount) => {
  const positive = Number(amount) > 0;
  if (role === ROLES.STUDENT) return positive ? "student_credit" : "student_debt";
  if (role === ROLES.TEACHER) return positive ? "teacher_credit" : "teacher_debt";
  return positive ? "staff_credit" : "staff_debt";
};

/**
 * SAQLANGAN summani "party" konvensiyasiga keltiradi (+ = markaz qarzdor).
 *
 * Balansni O'QIYDIGAN har bir joy SHU funksiyadan o'tishi shart -
 * `ob.amount` ni to'g'ridan-to'g'ri ishlatish eski (flow) yozuvlarda
 * o'qituvchi/xodim ishorasini teskari ko'rsatadi.
 */
export const partyAmount = (ob) => {
  const amt = Number(ob?.amount) || 0;
  if (!amt) return 0;
  // Yangi yozuvlar allaqachon shaxs nuqtai nazarida.
  if (ob?.signConvention === "party") return amt;
  // Eski (flow): o'quvchida ikkala qoida mos tushadi, o'qituvchi/xodimda
  // teskari (u yerda +X "biz ortiqcha berdik" = u bizga qarz degani edi).
  return ob?.role === ROLES.STUDENT ? amt : -amt;
};

/**
 * Odam uchun boshlang'ich qoldiq allaqachon kiritilganmi.
 * Import ko'rib chiqish bosqichida ishlatiladi (yozishdan oldin ogohlantirish).
 */
export const existsFor = async (userId) =>
  Boolean(await OpeningBalance.exists({ user: userId }));

/** Bir nechta odam uchun birdaniga (import prepare bosqichi - N+1 so'rovsiz). */
export const existingUserIds = async (userIds) => {
  if (!userIds?.length) return new Set();
  const rows = await OpeningBalance.find({ user: { $in: userIds } }, { user: 1 }).lean();
  return new Set(rows.map((r) => String(r.user)));
};

// ─────────────────────────── MATERIALIZATSIYA ───────────────────────────

// O'QUVCHI, AVANS (+X). Depozitga tushadi va darhol mavjud qarzlarni
// eng eskisidan boshlab yopadi - bu aynan talab qilingan xulq:
// "300k balansga yoziladi va shu paytgacha bo'lgan to'lovlarni yopadi".
const materializeStudentCredit = async (ob, { currentUser }) => {
  // paidAt - boshlang'ich davr oxiri. Kelajakda bo'lmasligi shart
  // (topup tekshiradi), shuning uchun bugundan oshsa bugunga tushiramiz.
  const periodEnd = new Date(Date.UTC(ob.year, ob.month, 0));
  const today = localTodayMidnight();
  const paidAt = periodEnd.getTime() > today.getTime() ? today : periodEnd;

  const deposit = await depositService.topup(
    ob.user,
    {
      amount: ob.amount, // musbat
      method: "cash",
      paidAt,
      note: "Boshlang'ich avans (tizimga o'tishda kiritilgan)",
      isOpening: true,
    },
    currentUser,
  );

  const refs = [{ model: "StudentDeposit", docId: deposit._id }];
  if (deposit.$lastTransactionId) {
    refs.push({ model: "DepositTransaction", docId: deposit.$lastTransactionId });
  }
  return refs;
};

// O'QUVCHI, QARZ (-X). Sintetik oylik plan qatori. isOpening=true bo'lgani
// uchun recalc() unga tegmaydi va hisobotda "hisoblangan daromad"ga kirmaydi,
// lekin qarzdorlar ro'yxatida va to'lov taqsimotida NORMAL qator kabi ishtirok
// etadi - ya'ni keyingi to'lov uni birinchi bo'lib yopadi.
const materializeStudentDebt = async (ob) => {
  const branchId = ob.branchId || (await resolveBranchFromGroup(ob.group));
  if (!branchId) {
    throw new ApiError(400, "O'quvchi guruhining filiali aniqlanmadi");
  }

  const amount = Math.abs(ob.amount);
  const doc = await StudentPayment.create({
    branchId,
    student: ob.user,
    group: ob.group,
    membership: null,
    year: ob.year,
    month: ob.month,
    baseFee: amount,
    prorationFactor: 1,
    discountApplied: 0,
    expectedAmount: amount,
    paidAmount: 0,
    status: "unpaid",
    isOpening: true,
    recalculatedAt: new Date(),
  });

  // O'quvchining depozitida pul bo'lsa (avval boshqa import qatori
  // tushirgan bo'lishi mumkin) - yangi qarzni darhol qoplaymiz.
  // Best-effort: qoplanmasa qarz shunchaki ochiq qoladi, buzilish yo'q.
  try {
    await depositService.autoApply(ob.user);
  } catch (err) {
    logger.warn(
      { err: err?.message, student: String(ob.user) },
      "Boshlang'ich qarzdan keyin depozit avto-qoplash bajarilmadi",
    );
  }

  return [{ model: "StudentPayment", docId: doc._id }];
};

// O'QITUVCHI. Ikkala yo'nalish ham bitta qator: kind="opening",
// ishorasi expectedAmount'da.
//   credit (biz qarzmiz)  → musbat, mavjud maosh to'lovi yo'li bilan to'lanadi
//   debt   (u bizga qarz) → manfiy, oylik yig'indisini kamaytiradi
//
// isLocked=true - modelda AYNAN shu holat uchun mavjud himoya
// ("markaz boshqa tizimdan ko'chib kelganda"): hech qanday avtomatik
// qayta hisob bu qatorga tegmaydi.
const materializeTeacher = async (ob) => {
  // GURUH IXTIYORIY: qoldiq markaz darajasidagi majburiyat (qarang
  // teacherSalary.model.js pre-validate izohi). Guruh berilmasa filial
  // o'qituvchining o'z filialidan olinadi.
  let branchId = ob.branchId;
  if (!branchId && ob.group) branchId = await resolveBranchFromGroup(ob.group);
  if (!branchId) {
    const teacher = await User.findById(ob.user, { homeBranchId: 1 }).lean();
    branchId = teacher?.homeBranchId || null;
  }
  if (!branchId) throw new ApiError(400, "O'qituvchining filiali aniqlanmadi");

  // credit → musbat (biz qarzmiz), debt → manfiy (u bizga qarz).
  const expectedAmount =
    ob.kind === "teacher_credit" ? Math.abs(ob.amount) : -Math.abs(ob.amount);

  const doc = await TeacherSalary.create({
    branchId,
    teacher: ob.user,
    group: ob.group || null,
    year: ob.year,
    month: ob.month,
    kind: "opening",
    expectedAmount,
    paidAmount: 0,
    status: "unpaid",
    isOpening: true,
    isLocked: true,
    source: "manual",
    reason: "Boshlang'ich qoldiq (tizimga o'tishda kiritilgan)",
  });

  return [{ model: "TeacherSalary", docId: doc._id }];
};

// XODIM. Alohida tuzatish qatori. opening_debt oylikdan katta bo'lsa
// qoldig'i keyingi oyga ko'chiriladi (staffPayroll.service.js ->
// carryOverOpeningDebt) - shuning uchun bu yerda hech narsa qirqilmaydi.
const materializeStaff = async (ob) => {
  const employee = await User.findById(ob.user, { homeBranchId: 1 }).lean();

  const doc = await StaffPayrollAdjustment.create({
    employee: ob.user,
    branchId: ob.branchId || employee?.homeBranchId || null,
    year: ob.year,
    month: ob.month,
    kind: ob.kind === "staff_credit" ? "opening_credit" : "opening_debt",
    amount: Math.abs(ob.amount),
    reason: "Boshlang'ich qoldiq (tizimga o'tishda kiritilgan)",
  });

  // Oylik qatorini darhol quramiz. IKKI SABAB:
  //  1) egasi natijani shu zahoti ko'radi;
  //  2) MUHIMROQ - ko'chirish zanjiri StaffPayroll qatoriga tayanadi
  //     (openingDebtTotal / openingDebtApplied). Qator bo'lmasa qarz
  //     o'sha oyda muzlab qolardi va keyingi oyga o'tmasdi.
  // Best-effort: shartnomasi yo'q xodimda hisob 0 chiqadi, xato emas.
  try {
    await staffPayrollService.computePayroll(ob.user, ob.year, ob.month, {
      source: "manual",
    });
  } catch (err) {
    logger.warn(
      { err: err?.message, employee: String(ob.user), year: ob.year, month: ob.month },
      "Boshlang'ich qoldiqdan keyin xodim oyligini hisoblab bo'lmadi",
    );
  }

  return [{ model: "StaffPayrollAdjustment", docId: doc._id }];
};

const MATERIALIZERS = {
  student_credit: materializeStudentCredit,
  student_debt: materializeStudentDebt,
  teacher_credit: materializeTeacher,
  teacher_debt: materializeTeacher,
  staff_credit: materializeStaff,
  staff_debt: materializeStaff,
};

// ────────────────────────────── UMUMIY YO'L ──────────────────────────────

/**
 * Boshlang'ich qoldiqni yozadi va materializatsiya qiladi.
 *
 * @returns {{status: "created"|"duplicate", opening: object}}
 *   duplicate - bu odamda allaqachon boshlang'ich qoldiq bor. XATO EMAS:
 *   import qayta yuklanganda kutilgan holat, qator "takror" deb belgilanadi.
 */
export const create = async (
  { user, role, amount, group = null, branchId = null, joinedAt = null, note = "" },
  { currentUser = null, importJob = null } = {},
) => {
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt === 0) {
    throw new ApiError(400, "Boshlang'ich summa nolga teng bo'lmagan butun son bo'lishi kerak");
  }
  if (Math.abs(amt) > OPENING_MAX_AMOUNT) {
    throw new ApiError(
      400,
      `Boshlang'ich summa ${OPENING_MAX_AMOUNT.toLocaleString("ru-RU")} so'mdan oshmasligi kerak`,
    );
  }

  const kind = resolveKind(role, amt);

  // O'QUVCHI QARZI GURUHSIZ: yozuv yaratiladi, lekin MATERIALIZATSIYA
  // KUTIB TURADI. StudentPayment guruhsiz mavjud bo'lolmaydi, o'quvchi
  // esa guruhga qo'shilishidan oldin yaratiladi - va uning eski qarzi
  // aynan shu daqiqada ma'lum bo'ladi.
  //
  // Xato QAYTARILMAYDI: qarz ledgerda darhol ko'rinadi (ledger
  // OpeningBalance hujjatining O'ZIDAN o'qiydi, materializatsiya
  // natijasidan emas), guruhga qo'shilganda esa qator avtomatik
  // yoziladi - qarang materializePendingForStudent().
  const awaitingGroup = kind === "student_debt" && !group;

  // DAVR. O'quvchida - eng eski oydan oldingi oy (to'lov taqsimoti shunga
  // tayanadi). Boshqalarda - o'tgan oy: xodimda ko'chirish zanjiri aynan
  // o'tgan oydan boshlanadi (generateMonth joriy oyda o'tganini qaraydi).
  const today = periodOfDate(localTodayMidnight());
  const period =
    role === ROLES.STUDENT
      ? await resolveOpeningPeriod({ student: user, group, joinedAt })
      : prevPeriod(today.year, today.month);

  // ── 1-QADAM: LANGAR ──
  // Unique indeks shu yerda ishlaydi. Bu qator o'tsa - pul yozish
  // huquqi FAQAT shu chaqiruvda, boshqa hech kimda yo'q.
  let opening;
  try {
    opening = await OpeningBalance.create({
      user,
      role,
      amount: amt,
      branchId,
      group: group || null,
      year: period.year,
      month: period.month,
      kind,
      // Yangi yozuvlar HAR DOIM shaxs nuqtai nazarida (+ = markaz qarzdor).
      signConvention: "party",
      pendingReason: awaitingGroup ? "awaiting_group" : "",
      note,
      importJob,
      createdBy: currentUser?._id || null,
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await OpeningBalance.findOne({ user }).lean();
      return { status: "duplicate", opening: existing };
    }
    throw err;
  }

  // ── 2-QADAM: MATERIALIZATSIYA ──
  // Guruh kutayotgan yozuv chetlab o'tiladi - "created" holatida qaytadi
  // va guruhga qo'shilishda materializePendingForStudent() uni oladi.
  if (awaitingGroup) return { status: "created", opening };

  try {
    const refs = await MATERIALIZERS[kind](opening, { currentUser });
    opening.materializedRefs = refs;
    opening.materializedAt = new Date();
    opening.materializeError = "";
    await opening.save();
  } catch (err) {
    // Langar QOLADI (qayta import pulni ikki marta yozmasin), lekin
    // xato yozib qo'yiladi va repairPending() bilan tuzatiladi.
    opening.materializeError = String(err?.message || err).slice(0, 500);
    await opening.save().catch(() => null);
    logger.error(
      { err, user: String(user), kind },
      "Boshlang'ich qoldiqni materializatsiya qilib bo'lmadi",
    );
    throw err;
  }

  return { status: "created", opening };
};

/**
 * YARIM QOLGANLARNI TUZATISH.
 *
 * Langar yozilib, materializatsiya yiqilgan yozuvlarni qayta urinadi.
 * Idempotent: har bir materializator o'z hujjatini yaratadi, muvaffaqiyat
 * bo'lsa materializedAt qo'yiladi va yozuv boshqa tanlanmaydi.
 *
 * DIQQAT: bu funksiya PUL YOZADI. Faqat ochiq (owner) chaqiruv bilan
 * ishlaydi - avtomatik job'ga ULANMAGAN, chunki takroriy avtomatik
 * urinish doimiy yiqilayotgan yozuvda log'ni to'ldirardi va, eng
 * yomoni, yarim tuzatilgan holatni ko'zdan yashirardi.
 */
export const repairPending = async ({ limit = 200, currentUser = null } = {}) => {
  // `pendingReason` bo'sh bo'lganlar - ya'ni HAQIQATAN yiqilganlar.
  // Guruh kutayotgan o'quvchilar bu yerga tushmaydi: ularda tuzatiladigan
  // narsa yo'q va har urinishda bir xil xato bilan yiqilib, ro'yxatni
  // shovqin bilan to'ldirardi.
  const pending = await OpeningBalance.find({
    materializedAt: null,
    pendingReason: "",
  })
    .limit(limit)
    .sort({ createdAt: 1 });

  let repaired = 0;
  const failed = [];

  for (const ob of pending) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const refs = await MATERIALIZERS[ob.kind](ob, { currentUser });
      ob.materializedRefs = refs;
      ob.materializedAt = new Date();
      ob.materializeError = "";
      // eslint-disable-next-line no-await-in-loop
      await ob.save();
      repaired += 1;
    } catch (err) {
      failed.push({ user: String(ob.user), message: err?.message || "xato" });
    }
  }

  return { total: pending.length, repaired, failed };
};

/**
 * GURUH KUTAYOTGAN BOSHLANG'ICH QARZNI YOZIB QO'YISH.
 *
 * O'quvchi BIRINCHI guruhga qo'shilganda chaqiriladi. Shu daqiqada
 * StudentPayment qatori uchun kerak bo'lgan yagona narsa - guruh -
 * paydo bo'ladi.
 *
 * IDEMPOTENT: faqat `materializedAt: null` VA `pendingReason:
 * "awaiting_group"` bo'lgan yozuv olinadi. Muvaffaqiyatdan keyin
 * ikkala shart ham buziladi, ya'ni ikkinchi guruhga qo'shilish yana
 * bir qarz qatori yaratmaydi.
 *
 * BEST-EFFORT: bu yerdagi xato guruhga qo'shishni BEKOR QILMAYDI.
 * O'quvchi guruhsiz qolgandan ko'ra, qarzi materializatsiyasiz
 * (lekin ledgerda ko'rinib turgan holda) qolgani yaxshiroq - yozuv
 * `materializeError` bilan belgilanadi va repairPending() oladi.
 */
export const materializePendingForStudent = async (studentId, groupId) => {
  if (!studentId || !groupId) return null;

  const ob = await OpeningBalance.findOne({
    user: studentId,
    kind: "student_debt",
    materializedAt: null,
    pendingReason: "awaiting_group",
  });
  if (!ob) return null;

  // DAVR QAYTA HISOBLANMAYDI (year/month `immutable`) - va SHART EMAS.
  //
  // Yaratilishda davr `enrolledAt` dan bir oy OLDIN qo'yilgan, a'zolik esa
  // ro'yxatga olingan sanadan oldin boshlana olmaydi (groups.service.js ->
  // applyMembershipDates buni rad etadi). Demak guruhning eng eski oylik
  // plani HAR DOIM shu davrdan keyin turadi va to'lov taqsimoti eng eski
  // qarzni - boshlang'ich qarzni - birinchi bo'lib yopadi.
  ob.group = groupId;
  if (!ob.branchId) ob.branchId = await resolveBranchFromGroup(groupId);

  try {
    const refs = await materializeStudentDebt(ob);
    ob.materializedRefs = refs;
    ob.materializedAt = new Date();
    ob.materializeError = "";
    ob.pendingReason = "";
    await ob.save();
    return ob;
  } catch (err) {
    // Kutish holatidan CHIQARILADI: sabab endi "guruh yo'q" emas, haqiqiy
    // xato. Shu bilan yozuv repairPending() ko'rish maydoniga o'tadi.
    ob.pendingReason = "";
    ob.materializeError = String(err?.message || err).slice(0, 500);
    await ob.save().catch(() => null);
    logger.error(
      { err, student: String(studentId), group: String(groupId) },
      "Guruhga qo'shilgandan keyin boshlang'ich qarzni yozib bo'lmadi",
    );
    return null;
  }
};

/** Bitta odamning boshlang'ich qoldig'i (profil kartochkasi uchun). */
export const getForUser = async (userId) =>
  OpeningBalance.findOne({ user: userId }).lean();

/** Ro'yxat - owner nazorati uchun (yarim qolganlar birinchi). */
export const list = async ({ page = 1, limit = 50, pendingOnly = false } = {}) => {
  // FILIAL KO'LAMI: OpeningBalance'da `branchId` bor.
  //
  // Ilgari bu route owner-only edi va filtr keraksiz tuyulardi. Endi u
  // `finance.opening_balance` ruxsatiga ochilgan, ya'ni filial direktori
  // ham kiradi - filtrsiz u butun markazning boshlang'ich qoldiqlarini
  // (ya'ni boshqa filiallarning qarz/avans summalarini) ko'rardi.
  const filter = {
    ...branchFilter(),
    ...(pendingOnly ? { materializedAt: null } : {}),
  };
  const skip = (Math.max(1, page) - 1) * limit;
  const [rows, total] = await Promise.all([
    OpeningBalance.find(filter)
      .sort({ materializedAt: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", { firstName: 1, lastName: 1, username: 1, role: 1 })
      .populate("group", { name: 1 })
      .lean(),
    OpeningBalance.countDocuments(filter),
  ]);
  return { rows, total, page, limit };
};

/** Import ko'rib chiqishi uchun umumiy yig'indi (avans / qarz alohida). */
export const summarize = (rows) => {
  let credit = 0;
  let debt = 0;
  for (const r of rows) {
    const a = Number(r?.openingAmount) || 0;
    if (a > 0) credit += a;
    else debt += Math.abs(a);
  }
  return { credit, debt };
};
