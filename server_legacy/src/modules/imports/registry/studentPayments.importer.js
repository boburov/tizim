import crypto from "node:crypto";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { ROLES } from "../../../constants/roles.js";
import prisma from "../../../config/prisma.js";
import {
  branchFilter,
  userBranchCondition,
} from "../../../helpers/branchContext.helper.js";
import { normalizePhone } from "../../../utils/phone.js";
import * as transactionService from "../../finance/services/transaction.service.js";
import { ROW_STATUS } from "../services/importEngine.service.js";
import { asText, asMoney, asDate, asYear, asMonth, asEnum, isBlank } from "../services/coerce.service.js";

const METHOD_MAP = {
  naqd: "cash",
  cash: "cash",
  "naqd pul": "cash",
  karta: "card",
  card: "card",
  plastik: "card",
  plastic: "card",
  "bank karta": "card",
};

const dateKey = (d) => d.toISOString().slice(0, 10);

const buildIdempotencyKey = (d) =>
  "imp:sp:" +
  crypto
    .createHash("sha256")
    .update(
      [
        String(d.studentId),
        String(d.groupId),
        d.year,
        d.month,
        d.amount,
        dateKey(d.paidAt),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 40);

const norm = (v) => String(v ?? "").trim().toLowerCase();

const studentPaymentsImporter = {
  key: "student-payments",
  label: "O'quvchi to'lovlari",
  fileBase: "oquvchi-tolovlari-import",
  sheetName: "To'lovlar",
  permission: PERMISSIONS.FINANCE_PAY,

  columns: [
    {
      key: "studentRef",
      header: "O'quvchi ID (login yoki telefon)",
      width: 26,
      required: true,
      example: "ali.valiyev",
      note: "O'quvchining tizimdagi logini yoki telefon raqami. Majburiy.",
    },
    {
      key: "studentName",
      header: "O'quvchi F.I.O (tekshirish uchun)",
      width: 26,
      required: false,
      example: "Ali Valiyev",
      note: "Ixtiyoriy. To'ldirilsa, login bo'yicha topilgan o'quvchi ismi bilan solishtiriladi.",
    },
    {
      key: "groupName",
      header: "Guruh",
      width: 22,
      required: true,
      example: "Ingliz tili A1",
      note: "Guruh nomi (aynan tizimdagidek). Majburiy - to'lov qaysi guruh oyiga tegishli ekani shundan aniqlanadi.",
    },
    {
      key: "year",
      header: "Yil",
      width: 10,
      required: true,
      example: 2025,
      note: "To'lov qaysi oy uchun ekani. Masalan 2025.",
    },
    {
      key: "month",
      header: "Oy",
      width: 10,
      required: true,
      example: 6,
      note: "1-12 oralig'ida raqam yoki oy nomi (iyun).",
    },
    {
      key: "amount",
      header: "To'lov summasi (so'm)",
      width: 20,
      required: true,
      example: 500000,
      note: "Musbat butun son. Oylik qarzdan ortsa - keyingi qarz oylarga, qolgani depozitga (garov) tushadi.",
    },
    {
      key: "method",
      header: "To'lov turi",
      width: 14,
      required: false,
      example: "naqd",
      note: "naqd yoki karta. Bo'sh qoldirilsa - naqd.",
    },
    {
      key: "paidAt",
      header: "To'lov sanasi",
      width: 16,
      required: true,
      example: "2025-06-15",
      note: "2025-06-15 yoki 15.06.2025. Kelajak sana bo'lishi mumkin emas.",
    },
    {
      key: "note",
      header: "Izoh",
      width: 30,
      required: false,
      example: "Iyun oyi uchun",
      note: "Ixtiyoriy izoh.",
    },
  ],

  prepare: async (rawRows) => {
    const refs = new Set();
    const groupNames = new Set();
    for (const raw of rawRows) {
      if (!isBlank(raw.studentRef)) refs.add(norm(raw.studentRef));
      if (!isBlank(raw.groupName)) groupNames.add(norm(raw.groupName));
    }

    const phones = [...refs].map(normalizePhone).filter(Boolean);
    const branchCond = userBranchCondition();
    
    const students = await prisma.user.findMany({
      where: {
        role: ROLES.STUDENT,
        isDeleted: false,
        OR: [{ username: { in: [...refs] } }, { phone: { in: phones } }],
        ...(branchCond ? { AND: [branchCond] } : {})
      },
      select: { id: true, firstName: true, lastName: true, username: true, phone: true }
    });

    const studentByRef = new Map();
    for (const s of students) {
      if (s.username) studentByRef.set(norm(s.username), s);
      if (s.phone) studentByRef.set(norm(s.phone), s);
    }

    const groups = await prisma.group.findMany({
      where: { isDeleted: false, ...branchFilter() },
      select: { id: true, name: true, isActive: true, branchId: true }
    });
    
    const groupByName = new Map();
    for (const g of groups) {
      const k = norm(g.name);
      if (groupByName.has(k)) groupByName.set(k, "AMBIGUOUS");
      else groupByName.set(k, g);
    }

    const studentIds = [...new Set(students.map((s) => String(s.id)))];
    const groupIds = groups.map((g) => g.id);
    const obligations = studentIds.length
      ? await prisma.studentPayment.findMany({
          where: {
            ...branchFilter(),
            studentId: { in: studentIds },
            groupId: { in: groupIds },
            // ⚠ `isDeleted` OLIB TASHLANDI — `StudentPayment` da bunday
            // USTUN YO'Q (qarang `schema.prisma`; `financeReport.service.js`
            // da ham shu izoh bor). Prisma uni "Unknown argument" bilan
            // RAD ETADI, ya'ni o'quvchi to'lovlarini import qilishning
            // ko'rib chiqish (preview) va yozish (commit) yo'llari HAR
            // chaqiruvda yiqilardi.
          },
          select: { id: true, studentId: true, groupId: true, year: true, month: true, expectedAmount: true, paidAmount: true, writtenOff: true },
        })
      : [];

    const obligationByKey = new Map();
    for (const o of obligations) {
      obligationByKey.set(`${o.studentId}|${o.groupId}|${o.year}|${o.month}`, o);
    }

    const ctx = { studentByRef, groupByName, obligationByKey, existingKeys: new Set() };

    const keys = [];
    for (const raw of rawRows) {
      const { errors, data } = studentPaymentsImporter.validateRow(raw, ctx);
      if (!errors.length && data) keys.push(buildIdempotencyKey(data));
    }
    
    if (keys.length) {
      const existing = await prisma.paymentTransaction.findMany({
        where: { idempotencyKey: { in: keys } },
        select: { idempotencyKey: true },
      });
      ctx.existingKeys = new Set(existing.map((t) => t.idempotencyKey));
    }

    return ctx;
  },

  validateRow: (raw, ctx) => {
    const errors = [];
    const push = (field, message) => errors.push({ field, message });

    const refRes = asText(raw.studentRef);
    const ref = norm(refRes.value);
    let student = null;
    if (!ref) push("O'quvchi ID", "Bo'sh");
    else {
      student = ctx.studentByRef.get(ref) || ctx.studentByRef.get(norm(normalizePhone(ref)));
      if (!student) push("O'quvchi ID", "Bunday o'quvchi topilmadi (yoki boshqa filialda)");
    }

    if (student && !isBlank(raw.studentName)) {
      const given = norm(raw.studentName).replace(/\s+/g, " ");
      const actual = norm(`${student.firstName} ${student.lastName || ""}`).replace(/\s+/g, " ");
      const reversed = norm(`${student.lastName || ""} ${student.firstName}`).replace(/\s+/g, " ");
      if (given !== actual && given !== reversed) {
        push("O'quvchi F.I.O", `Login bilan mos emas (bazada: ${student.firstName} ${student.lastName || ""})`);
      }
    }

    const groupRes = asText(raw.groupName);
    let group = null;
    if (!groupRes.value) push("Guruh", "Bo'sh");
    else {
      const found = ctx.groupByName.get(norm(groupRes.value));
      if (found === "AMBIGUOUS") {
        push("Guruh", "Bu nomda bir nechta guruh bor - nomni aniqlashtiring");
      } else if (!found) {
        push("Guruh", "Bunday guruh topilmadi (yoki boshqa filialda)");
      } else {
        group = found;
      }
    }

    const yearRes = asYear(raw.year);
    if (!yearRes.ok) push("Yil", yearRes.error);
    const monthRes = asMonth(raw.month);
    if (!monthRes.ok) push("Oy", monthRes.error);

    const amountRes = asMoney(raw.amount, { min: 1, max: 50_000_000 });
    if (!amountRes.ok) push("To'lov summasi", amountRes.error);

    const dateRes = asDate(raw.paidAt);
    if (!dateRes.ok) push("To'lov sanasi", dateRes.error);

    const methodRes = asEnum(raw.method, METHOD_MAP, { fallback: "cash" });
    if (!methodRes.ok) push("To'lov turi", methodRes.error);

    const noteRes = asText(raw.note, { max: 300 });
    if (!noteRes.ok) push("Izoh", noteRes.error);

    let obligation = null;
    if (student && group && yearRes.ok && monthRes.ok) {
      obligation = ctx.obligationByKey.get(
        `${student.id}|${group.id}|${yearRes.value}|${monthRes.value}`,
      );
      if (!obligation) {
        push(
          "Oy",
          "Bu o'quvchi uchun shu guruh va oyda to'lov rejasi yo'q " +
            "(o'quvchi o'sha oyda guruhda bo'lmagan yoki oylik hali yaratilmagan)",
        );
      } else if (obligation.writtenOff) {
        push("Oy", "Bu oy yomon qarz sifatida hisobdan chiqarilgan - to'lov yozib bo'lmaydi");
      }
    }

    if (errors.length) return { errors, data: null };

    return {
      errors: [],
      data: {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName || ""}`.trim(),
        groupId: group.id,
        groupName: group.name,
        paymentId: obligation.id,
        year: yearRes.value,
        month: monthRes.value,
        amount: amountRes.value,
        method: methodRes.value,
        paidAt: dateRes.value,
        note: noteRes.value,
      },
    };
  },

  dedupeKey: (data) => (data ? buildIdempotencyKey(data) : null),

  commitRow: async (data, _ctx, { currentUser }) => {
    const result = await transactionService.create(
      {
        paymentId: data.paymentId,
        amount: data.amount,
        method: data.method,
        paidAt: data.paidAt,
        note: data.note || "Excel import",
        idempotencyKey: buildIdempotencyKey(data),
      },
      currentUser,
    );

    if (result?.duplicate) {
      return { status: ROW_STATUS.DUPLICATE, message: "Allaqachon kiritilgan" };
    }

    const parts = [];
    if (result?.allocated) parts.push(`${result.allocated} oyga taqsimlandi`);
    if (result?.depositCredited) {
      parts.push(`${result.depositCredited.toLocaleString("uz-UZ")} so'm depozitga`);
    }
    return { status: ROW_STATUS.IMPORTED, message: parts.join(", ") || null };
  },
};

export default studentPaymentsImporter;
