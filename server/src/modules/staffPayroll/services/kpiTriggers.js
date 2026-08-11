import mongoose from "mongoose";
import Lead from "../../../models/lead.model.js";
import User from "../../../models/user.model.js";
import Attendance from "../../../models/attendance.model.js";
import TeacherAttendance from "../../../models/teacherAttendance.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import { computeRate } from "../../attendance/services/attendance.service.js";

/**
 * TRIGGERLAR KATALOGI - KPI dvigatelining yagona kod qismi.
 *
 * FALSAFA: qoida (nima uchun, qancha, kimga) MA'LUMOT, o'lchash usuli esa
 * KOD. Yangi mukofot turi qo'shish uchun qoida yozuvi yaratiladi - deploy
 * kerak emas. Yangi O'LCHOV (hech qachon o'lchanmagan hodisa) kerak
 * bo'lgandagina shu faylga bitta trigger qo'shiladi.
 *
 * NEGA HODISA EMAS, DAVR BO'YICHA HISOB (pull, not push):
 *   • Idempotentlik: oyni istalgan marta qayta hisoblash mumkin, natija
 *     bir xil. Hodisa-asosli yechimda qo'shaloq yozuv yoki o'tkazib
 *     yuborilgan hodisa abadiy qolib ketardi.
 *   • Kech kelgan ma'lumot: davomat orqadan belgilanadi, to'lov keyin
 *     kiritiladi - hodisa o'sha paytda "hali shart bajarilmagan" derdi.
 *   • Qoida o'zgarsa oy qayta hisoblanadi va yangi shart bo'yicha to'g'ri
 *     natija chiqadi (yopilmagan oy uchun).
 *
 * Har trigger `evaluate` qaytaradigan qatorlar:
 *   { sourceType, sourceId, quantity, base, meta }
 * `base` faqat percent turidagi mukofot uchun kerak (foiz nimadan
 * olinishini trigger biladi, qoida emas).
 */

const toId = (v) => new mongoose.Types.ObjectId(String(v));

// Oy chegaralari - loyihadagi hamma joyda bir xil (UTC oy boshi/oxiri).
export const monthRange = (year, month) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  endExcl: new Date(Date.UTC(year, month, 1)),
});

/**
 * LID KIRITILDI - sotuvchi / call-center uchun.
 *
 * ATRIBUTSIYA: `Lead.createdBy` (lidni KIM kiritgan), `creditedTo` emas.
 * Ikkalasi ATAYLAB boshqa-boshqa: bitta lid uchun sotuvchi topgani uchun,
 * resepshin aylantirgani uchun mukofot oladi va bu ikki qoida bir-biriga
 * xalaqit bermaydi.
 *
 * NEGA IKKI HIMOYA SHARTDA TURADI:
 * Bu triggerda mukofot xodim FORMANI TO'LDIRGANI uchun to'lanadi, yozish
 * esa tekin - qolgan triggerlardan farqli o'laroq bu yerda soxta ma'lumot
 * to'g'ridan-to'g'ri pulga aylanadi. Shuning uchun:
 *   • minStatus  - lid kamida shu bosqichga YETGAN bo'lsin. "new" da qolgan
 *     yozuv - hech kim ko'tarmagan raqam, u pul emas;
 *   • dedupeDays - bitta raqam shu oraliqda BIR MARTA to'lanadi (bir
 *     raqamni uch marta kiritish = bitta mukofot).
 *
 * NEGA dedupe "kun oralig'i", oddiy "bir raqam - bir marta" emas:
 * takroriy telefon bu bazada QONUNIY (qarang: leads.service.create izohi -
 * kuzda ingliz tili, bahorda matematika; ona ikki farzandini bitta
 * raqamdan yozdiradi). Umrbod dedupe o'sha halol lidlarni ham to'lamay
 * qo'yardi. Oraliq esa aynan firibni - bir hafta ichida takrorlangan
 * yozuvni - kesadi. Standart 90 kun; 0 = butunlay o'chirilgan.
 *
 * DIQQAT (pull-model oqibati): Yanvar 30 da kiritilgan lid Fevral 2 da
 * "info_given" ga o'tsa, 1-fevralda hisoblangan yanvar maoshiga TUSHMAYDI -
 * oy qayta hisoblangandagina qo'shiladi. Oy yopilgan bo'lsa mukofot
 * yo'qoladi. Shuning uchun minStatus ni voronkaning boshiga yaqin
 * (info_given) qo'yish tavsiya etiladi.
 */

// Bosqich DARAJASI - "kamida shu yergacha yetdi" ni o'lchash uchun.
// `rejected` ataylab YO'Q: u daraja bermaydi. Aks holda "kiritdim va darhol
// rad etdim" eng oson firib yo'li bo'lib qolardi. Lid rad etilishidan oldin
// haqiqatan info_given bo'lgan bo'lsa - o'sha yozuv tarixda qoladi va
// daraja o'sha yerdan olinadi.
const LEAD_STAGE_RANK = {
  new: 0,
  info_given: 1,
  recontacted: 1,
  trial: 2,
  trial_attended: 3,
  enrolled: 4,
};

// Lid TARIXDA yetgan eng yuqori bosqich. Joriy status bo'yicha emas:
// lid orqaga qaytarilishi mumkin (enrolled -> recontacted), lekin bir marta
// bajarilgan ish bajarilganicha qoladi.
const reachedRank = (lead) => {
  let rank = LEAD_STAGE_RANK[lead.status] ?? 0;
  for (const h of lead.statusHistory || []) {
    const r = LEAD_STAGE_RANK[h.status];
    if (r != null && r > rank) rank = r;
  }
  return rank;
};

const DEFAULT_DEDUPE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const leadCreated = {
  key: "lead_created",
  label: "Lid kiritildi (sotuvchi)",
  sourceType: "lead",
  conditionKeys: ["minStatus", "dedupeDays", "sourceIds", "directionIds"],
  async evaluate({ employeeId, year, month, conditions }) {
    const { start, endExcl } = monthRange(year, month);
    const filter = {
      createdBy: toId(employeeId),
      createdAt: { $gte: start, $lt: endExcl },
    };
    // Ixtiyoriy shartlar: faqat ma'lum manba/yo'nalish uchun mukofot.
    if (conditions?.sourceIds?.length) {
      filter.source = { $in: conditions.sourceIds.map(toId) };
    }
    if (conditions?.directionIds?.length) {
      filter.direction = { $in: conditions.directionIds.map(toId) };
    }

    const leads = await Lead.find(filter, {
      firstName: 1,
      lastName: 1,
      phone: 1,
      status: 1,
      statusHistory: 1,
      createdAt: 1,
    }).lean();
    if (!leads.length) return [];

    // 1) SIFAT DARVOZASI
    const minRank = LEAD_STAGE_RANK[conditions?.minStatus] ?? 0;
    const qualified =
      minRank > 0 ? leads.filter((l) => reachedRank(l) >= minRank) : leads;
    if (!qualified.length) return [];

    // 2) TAKRORIY RAQAM
    const dedupeDays =
      conditions?.dedupeDays == null
        ? DEFAULT_DEDUPE_DAYS
        : Number(conditions.dedupeDays);
    if (!(dedupeDays > 0)) return qualified.map(rowOfLead);

    const windowMs = dedupeDays * DAY_MS;
    const phones = [...new Set(qualified.map((l) => l.phone).filter(Boolean))];

    // BARCHA yaratuvchilar bo'ylab qidiramiz, faqat shu xodim bo'yicha emas:
    // aks holda ikki sotuvchi bitta raqamni kiritib, IKKALASI ham pul olardi.
    const sameNumber = await Lead.find(
      { phone: { $in: phones }, createdAt: { $lt: endExcl } },
      { phone: 1, createdAt: 1 },
    ).lean();

    const byPhone = new Map();
    for (const row of sameNumber) {
      const list = byPhone.get(row.phone);
      if (list) list.push(row);
      else byPhone.set(row.phone, [row]);
    }

    return qualified
      .filter((lead) => {
        const siblings = byPhone.get(lead.phone) || [];
        // Oraliq ichida O'ZIDAN OLDIN kelgan yozuv bormi?
        return !siblings.some((s) => {
          if (String(s._id) === String(lead._id)) return false;
          const gap = new Date(lead.createdAt) - new Date(s.createdAt);
          // Bir xil soniyada yaratilgan ikki yozuvdan qaysi biri "oldin"
          // ekani sanadan chiqmaydi - kichik _id yutadi. Bu shart BARQAROR
          // bo'lishi kerak, aks holda oy har qayta hisoblanganda boshqa
          // qator to'lanardi.
          if (gap === 0) return String(s._id) < String(lead._id);
          return gap > 0 && gap <= windowMs;
        });
      })
      .map(rowOfLead);
  },
};

const rowOfLead = (l) => ({
  sourceType: "lead",
  sourceId: l._id,
  quantity: 1,
  base: 0,
  meta: {
    leadName: [l.firstName, l.lastName].filter(Boolean).join(" "),
    phone: l.phone || "",
    status: l.status,
    createdAt: l.createdAt,
  },
});

/**
 * LID -> O'QUVCHI KONVERSIYASI.
 *
 * Mukofot lidga MAS'UL xodimga tegadi (Lead.creditedTo) - u konversiya
 * paytida bir marta muzlatiladi. Shuning uchun mas'ulni keyin almashtirish
 * o'tgan oy maoshini qayta yozib yubormaydi.
 */
const leadConverted = {
  key: "lead_converted",
  label: "Lid o'quvchiga aylandi",
  sourceType: "lead",
  conditionKeys: ["sourceIds", "directionIds"],
  async evaluate({ employeeId, year, month, conditions }) {
    const { start, endExcl } = monthRange(year, month);
    const filter = {
      creditedTo: toId(employeeId),
      studentId: { $ne: null },
      convertedAt: { $gte: start, $lt: endExcl },
    };
    // Ixtiyoriy shartlar: faqat ma'lum manba/yo'nalish uchun mukofot.
    if (conditions?.sourceIds?.length) {
      filter.source = { $in: conditions.sourceIds.map(toId) };
    }
    if (conditions?.directionIds?.length) {
      filter.direction = { $in: conditions.directionIds.map(toId) };
    }

    const leads = await Lead.find(filter, {
      firstName: 1,
      lastName: 1,
      studentId: 1,
      convertedAt: 1,
    }).lean();

    return leads.map((l) => ({
      sourceType: "lead",
      sourceId: l._id,
      quantity: 1,
      base: 0,
      meta: {
        leadName: [l.firstName, l.lastName].filter(Boolean).join(" "),
        studentId: l.studentId ? String(l.studentId) : null,
        convertedAt: l.convertedAt,
      },
    }));
  },
};

/**
 * O'QUVCHI BIRINCHI TO'LOVNI QILDI.
 *
 * Konversiya QARZ yaratadi, tushum emas (groups.service ensureFinance...
 * `status: "unpaid"` qatorlarini ochadi). Shuning uchun "pul keldi"
 * PaymentTransaction'dan o'qiladi.
 *
 * "Birinchi" - o'quvchining umuman birinchi to'lovi: shu oyda bo'lsa
 * mukofot beriladi. Keyingi oylarda takrorlanmaydi.
 */
const studentFirstPayment = {
  key: "student_first_payment",
  label: "O'quvchi birinchi to'lovni qildi",
  sourceType: "payment",
  conditionKeys: ["minAmount"],
  async evaluate({ employeeId, year, month, conditions }) {
    const { start, endExcl } = monthRange(year, month);

    // AVVAL lidlardan boshlaymiz (indekslangan: creditedTo), keyin
    // o'quvchilar. Teskari tartibda butun o'quvchilar jadvali
    // o'qilardi - katta markazda bu qimmat.
    const ownedLeads = await Lead.find(
      { creditedTo: toId(employeeId), studentId: { $ne: null } },
      { studentId: 1 },
    ).lean();
    if (!ownedLeads.length) return [];

    const mine = await User.find(
      {
        _id: { $in: ownedLeads.map((l) => l.studentId) },
        isDeleted: { $ne: true },
      },
      { _id: 1, firstName: 1, lastName: 1 },
    ).lean();
    if (!mine.length) return [];

    const studentIds = mine.map((s) => toId(s._id));
    // Har o'quvchining ENG BIRINCHI to'lovi - bitta agregatda.
    const rows = await PaymentTransaction.aggregate([
      { $match: { student: { $in: studentIds }, isDeleted: { $ne: true } } },
      { $sort: { paidAt: 1 } },
      {
        $group: {
          _id: "$student",
          firstAt: { $first: "$paidAt" },
          firstId: { $first: "$_id" },
          firstAmount: { $first: "$amount" },
        },
      },
    ]);

    const nameOf = new Map(
      mine.map((s) => [
        String(s._id),
        [s.firstName, s.lastName].filter(Boolean).join(" "),
      ]),
    );
    const minAmount = Number(conditions?.minAmount || 0);

    return rows
      .filter((r) => r.firstAt >= start && r.firstAt < endExcl)
      .filter((r) => r.firstAmount >= minAmount)
      .map((r) => ({
        sourceType: "payment",
        sourceId: r.firstId,
        quantity: 1,
        base: r.firstAmount,
        meta: {
          studentName: nameOf.get(String(r._id)) || "",
          paidAt: r.firstAt,
          amount: r.firstAmount,
        },
      }));
  },
};

/**
 * O'QUVCHI QOLDI (retention).
 *
 * Misol: "30 kun qatnadi va davomati >= 80%" -> 25 000 so'm.
 *
 * Davomat foizi loyihadagi YAGONA formula bilan hisoblanadi
 * (attendance.service.computeRate: present / (present + absent)).
 * "excused", "exempt" va belgilanmagan kunlar maxrajga KIRMAYDI - agar
 * bu yerda boshqacha hisoblansa, xodim ko'rgan foiz davomat sahifasidagi
 * foizga to'g'ri kelmasdi.
 */
const studentRetained = {
  key: "student_retained",
  label: "O'quvchi belgilangan muddat qoldi",
  sourceType: "student",
  conditionKeys: ["minDays", "minAttendanceRate"],
  async evaluate({ employeeId, year, month, conditions }) {
    const { endExcl } = monthRange(year, month);
    const minDays = Number(conditions?.minDays || 30);
    const minRate = Number(conditions?.minAttendanceRate || 0);

    const ownedLeads = await Lead.find(
      { creditedTo: toId(employeeId), studentId: { $ne: null } },
      { studentId: 1 },
    ).lean();
    if (!ownedLeads.length) return [];

    const studentIds = ownedLeads.map((l) => toId(l.studentId));
    const students = await User.find(
      { _id: { $in: studentIds }, isDeleted: { $ne: true } },
      { firstName: 1, lastName: 1, enrolledAt: 1 },
    ).lean();
    if (!students.length) return [];

    // Mukofot O'SHA OYDA beriladi: muddat aynan shu oy ichida to'lgan
    // o'quvchilar. Aks holda har oy qayta-qayta to'lanardi.
    const eligible = students.filter((s) => {
      if (!s.enrolledAt) return false;
      const milestone = new Date(s.enrolledAt);
      milestone.setUTCDate(milestone.getUTCDate() + minDays);
      const { start } = monthRange(year, month);
      return milestone >= start && milestone < endExcl;
    });
    if (!eligible.length) return [];

    // Davomat - bitta agregat (har o'quvchi uchun alohida so'rov emas).
    const rows = await Attendance.aggregate([
      {
        $match: {
          student: { $in: eligible.map((s) => toId(s._id)) },
          isDeleted: { $ne: true },
          status: { $in: ["present", "absent"] },
        },
      },
      {
        $group: {
          _id: "$student",
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
        },
      },
    ]);
    const rateOf = new Map(
      rows.map((r) => [
        String(r._id),
        computeRate({ present: r.present, absent: r.absent }),
      ]),
    );

    return eligible
      .filter((s) => {
        const rate = rateOf.get(String(s._id));
        // null = umuman belgilanmagan. "Ma'lumot yo'q"ni 0% deb hisoblash
        // xodimni o'zi aybdor bo'lmagan narsa uchun jazolardi.
        if (minRate > 0) return rate !== null && rate >= minRate;
        return true;
      })
      .map((s) => ({
        sourceType: "student",
        sourceId: s._id,
        quantity: 1,
        base: 0,
        meta: {
          studentName: [s.firstName, s.lastName].filter(Boolean).join(" "),
          enrolledAt: s.enrolledAt,
          attendanceRate: rateOf.get(String(s._id)),
          minDays,
        },
      }));
  },
};

/**
 * XODIM QABUL QILGAN TO'LOVLAR.
 *
 * Kassir/resepshin uchun: shu oyda u kiritgan to'lovlar soni yoki
 * summasi. `percent` mukofot turi bilan birga ishlatilsa - inkassatsiya
 * foizi.
 */
const paymentsCollected = {
  key: "payments_collected",
  label: "Xodim qabul qilgan to'lovlar",
  sourceType: "payment",
  conditionKeys: ["minAmount"],
  async evaluate({ employeeId, year, month, conditions }) {
    const { start, endExcl } = monthRange(year, month);
    const minAmount = Number(conditions?.minAmount || 0);

    const rows = await PaymentTransaction.find(
      {
        createdBy: toId(employeeId),
        paidAt: { $gte: start, $lt: endExcl },
        amount: { $gte: minAmount || 1 },
        isDeleted: { $ne: true },
      },
      { amount: 1, paidAt: 1, student: 1 },
    ).lean();

    return rows.map((r) => ({
      sourceType: "payment",
      sourceId: r._id,
      quantity: 1,
      base: r.amount,
      meta: { amount: r.amount, paidAt: r.paidAt },
    }));
  },
};

/**
 * XODIMNING O'Z DAVOMATI.
 *
 * DIQQAT: hozircha manba faqat TeacherAttendance - va u
 * teacherAttendance.service.js:105-112 da `role === teacher` bilan
 * qattiq cheklangan, ya'ni resepshin/buxgalterni belgilab bo'lmaydi.
 * Trigger ma'lumot bo'lsa ishlaydi (o'qituvchi uchun bugunoq), xodimlar
 * uchun esa belgilash interfeysi qo'shilgach o'zi jonlanadi - qoida
 * o'zgartirilmaydi.
 *
 * Yozuv YO'QLIGI = kelgan (model sarlavhasidagi qoida), shuning uchun
 * "kelgan kunlar" = oydagi ish kunlari - belgilangan yo'q/sababli kunlar.
 */
const employeeAttendance = {
  key: "employee_attendance",
  label: "Xodim davomati",
  sourceType: "attendance",
  conditionKeys: ["countMode"],
  async evaluate({ employeeId, year, month }) {
    const { start, endExcl } = monthRange(year, month);
    const rows = await TeacherAttendance.find(
      {
        teacher: toId(employeeId),
        date: { $gte: start, $lt: endExcl },
        isDeleted: { $ne: true },
      },
      { status: 1 },
    ).lean();

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const missed = rows.filter((r) => r.status !== "present").length;
    const present = Math.max(0, daysInMonth - missed);

    // Bitta yig'ma qator (har kun uchun alohida emas): maosh varaqasida
    // 30 ta qator o'rniga "24 kun keldi" deb ko'rinadi.
    return [
      {
        sourceType: "attendance",
        sourceId: null,
        // Yig'ma qator HAR OY takrorlanadi, shuning uchun kalitga yil-oy
        // kiradi (aks holda umr bo'yi noyob indeks ikkinchi oyni bloklardi).
        eventKey: `attendance:${year}-${String(month).padStart(2, "0")}`,
        quantity: present,
        base: 0,
        meta: { presentDays: present, missedDays: missed, daysInMonth },
      },
    ];
  },
};

const TRIGGERS = [
  leadCreated,
  leadConverted,
  studentFirstPayment,
  studentRetained,
  paymentsCollected,
  employeeAttendance,
];

export const TRIGGER_MAP = new Map(TRIGGERS.map((t) => [t.key, t]));

export const getTrigger = (key) => TRIGGER_MAP.get(key) || null;

// Client qoida yaratish formasida shu ro'yxatni ko'rsatadi - triggerlar
// ikki joyda takrorlanmasin.
export const listTriggers = () =>
  TRIGGERS.map((t) => ({
    key: t.key,
    label: t.label,
    sourceType: t.sourceType,
    conditionKeys: t.conditionKeys,
  }));

export default TRIGGERS;
