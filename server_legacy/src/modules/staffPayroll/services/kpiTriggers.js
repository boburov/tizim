import prisma from "../../../config/prisma.js";
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

// MONGO → PRISMA
//   Lead.createdBy   → createdById      Lead.creditedTo → creditedToId
//   Lead.source      → sourceId         Lead.direction  → directionId
//   Attendance.student → studentId      TeacherAttendance.teacher → teacherId
//   PaymentTransaction.createdBy → createdById,  .student → studentId
//   `_id` → `id`   |   `$in` → `in`   |   `$ne: null` → `not: null`
//
// `toId()` OLIB TASHLANDI - Prisma kaliti oddiy 24-belgili satr.
//
// `computeRate` (attendance.service) SOF FUNKSIYA - bazaga tegmaydi,
// shuning uchun u modul hali Mongoose'da bo'lsa ham bu fayl mustaqil
// ko'chirildi.
const toId = (v) => String(v);

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
    const where = {
      createdById: toId(employeeId),
      createdAt: { gte: start, lt: endExcl },
    };
    // Ixtiyoriy shartlar: faqat ma'lum manba/yo'nalish uchun mukofot.
    if (conditions?.sourceIds?.length) {
      where.sourceId = { in: conditions.sourceIds.map(toId) };
    }
    if (conditions?.directionIds?.length) {
      where.directionId = { in: conditions.directionIds.map(toId) };
    }

    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        // `statusHistory` Prisma'da `Json` (Mongo'da embedded massiv edi) -
        // o'qishda shakl bir xil: [{ status, at, by }].
        statusHistory: true,
        createdAt: true,
      },
    });
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
    const sameNumber = await prisma.lead.findMany({
      where: { phone: { in: phones }, createdAt: { lt: endExcl } },
      select: { id: true, phone: true, createdAt: true },
    });

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
          if (String(s.id) === String(lead.id)) return false;
          const gap = new Date(lead.createdAt) - new Date(s.createdAt);
          // Bir xil soniyada yaratilgan ikki yozuvdan qaysi biri "oldin"
          // ekani sanadan chiqmaydi - kichik `id` yutadi. Bu shart BARQAROR
          // bo'lishi kerak, aks holda oy har qayta hisoblanganda boshqa
          // qator to'lanardi.
          if (gap === 0) return String(s.id) < String(lead.id);
          return gap > 0 && gap <= windowMs;
        });
      })
      .map(rowOfLead);
  },
};

const rowOfLead = (l) => ({
  sourceType: "lead",
  sourceId: l.id,
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
    const where = {
      creditedToId: toId(employeeId),
      studentId: { not: null },
      convertedAt: { gte: start, lt: endExcl },
    };
    // Ixtiyoriy shartlar: faqat ma'lum manba/yo'nalish uchun mukofot.
    if (conditions?.sourceIds?.length) {
      where.sourceId = { in: conditions.sourceIds.map(toId) };
    }
    if (conditions?.directionIds?.length) {
      where.directionId = { in: conditions.directionIds.map(toId) };
    }

    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentId: true,
        convertedAt: true,
      },
    });

    return leads.map((l) => ({
      sourceType: "lead",
      sourceId: l.id,
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
    const ownedLeads = await prisma.lead.findMany({
      where: { creditedToId: toId(employeeId), studentId: { not: null } },
      select: { studentId: true },
    });
    if (!ownedLeads.length) return [];

    const mine = await prisma.user.findMany({
      where: {
        id: { in: ownedLeads.map((l) => l.studentId) },
        isDeleted: false,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!mine.length) return [];

    const studentIds = mine.map((s) => s.id);

    // HAR O'QUVCHINING ENG BIRINCHI TO'LOVI.
    //
    // Mongo'da bu `$sort` + `$group/$first` quvuri edi - Prisma'ning
    // `groupBy` i "guruh ichidagi birinchi qator" ni bera olmaydi
    // (faqat _min/_max/_sum). Shuning uchun to'lovlar sana bo'yicha
    // O'SISH tartibida bir marta o'qilib, birinchisi JS'da olinadi.
    //
    // NEGA BU XAVFSIZ: filtr o'quvchilar ro'yxati bilan cheklangan
    // (butun jadval emas), ya'ni qatorlar soni shu xodimning
    // o'quvchilari to'lovlari bilan chegaralangan.
    //
    // TARTIB `id` bilan mustahkamlangan: bir xil `paidAt` da qaysi
    // to'lov "birinchi" ekani barqaror bo'lishi shart - aks holda oy
    // har qayta hisoblanganda boshqa qator mukofotlanardi.
    const txs = await prisma.paymentTransaction.findMany({
      where: { studentId: { in: studentIds }, isDeleted: false },
      select: { id: true, studentId: true, paidAt: true, amount: true },
      orderBy: [{ paidAt: "asc" }, { id: "asc" }],
    });

    const firstByStudent = new Map();
    for (const t of txs) {
      if (!firstByStudent.has(t.studentId)) firstByStudent.set(t.studentId, t);
    }

    const nameOf = new Map(
      mine.map((s) => [
        String(s.id),
        [s.firstName, s.lastName].filter(Boolean).join(" "),
      ]),
    );
    const minAmount = Number(conditions?.minAmount || 0);

    return [...firstByStudent.entries()]
      .filter(([, r]) => r.paidAt >= start && r.paidAt < endExcl)
      .filter(([, r]) => r.amount >= minAmount)
      .map(([studentId, r]) => ({
        sourceType: "payment",
        sourceId: r.id,
        quantity: 1,
        base: r.amount,
        meta: {
          studentName: nameOf.get(String(studentId)) || "",
          paidAt: r.paidAt,
          amount: r.amount,
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

    const ownedLeads = await prisma.lead.findMany({
      where: { creditedToId: toId(employeeId), studentId: { not: null } },
      select: { studentId: true },
    });
    if (!ownedLeads.length) return [];

    const studentIds = ownedLeads.map((l) => l.studentId);
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds }, isDeleted: false },
      select: { id: true, firstName: true, lastName: true, enrolledAt: true },
    });
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
    // Mongo `$group` + `$cond` o'rniga (studentId, status) bo'yicha
    // guruhlash: Prisma `_count` beradi, statuslar esa JS'da yig'iladi.
    const rows = await prisma.attendance.groupBy({
      by: ["studentId", "status"],
      where: {
        studentId: { in: eligible.map((s) => s.id) },
        isDeleted: false,
        status: { in: ["present", "absent"] },
      },
      _count: { _all: true },
    });
    const buckets = new Map();
    for (const r of rows) {
      const b = buckets.get(r.studentId) || { present: 0, absent: 0 };
      b[r.status] = r._count._all;
      buckets.set(r.studentId, b);
    }
    const rateOf = new Map(
      [...buckets.entries()].map(([sid, b]) => [String(sid), computeRate(b)]),
    );

    return eligible
      .filter((s) => {
        const rate = rateOf.get(String(s.id));
        // null = umuman belgilanmagan. "Ma'lumot yo'q"ni 0% deb hisoblash
        // xodimni o'zi aybdor bo'lmagan narsa uchun jazolardi.
        if (minRate > 0) return rate !== null && rate >= minRate;
        return true;
      })
      .map((s) => ({
        sourceType: "student",
        sourceId: s.id,
        quantity: 1,
        base: 0,
        meta: {
          studentName: [s.firstName, s.lastName].filter(Boolean).join(" "),
          enrolledAt: s.enrolledAt,
          // `rateOf` da yozuv bo'lmasa `undefined` emas, `null` beriladi:
          // "davomat umuman belgilanmagan" degani (yuqoridagi izohga qarang).
          attendanceRate: rateOf.get(String(s.id)) ?? null,
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

    const rows = await prisma.paymentTransaction.findMany({
      where: {
        createdById: toId(employeeId),
        paidAt: { gte: start, lt: endExcl },
        amount: { gte: minAmount || 1 },
        isDeleted: false,
      },
      select: { id: true, amount: true, paidAt: true, studentId: true },
    });

    return rows.map((r) => ({
      sourceType: "payment",
      sourceId: r.id,
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
    const rows = await prisma.teacherAttendance.findMany({
      where: {
        teacherId: toId(employeeId),
        date: { gte: start, lt: endExcl },
        isDeleted: false,
      },
      select: { status: true },
    });

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
