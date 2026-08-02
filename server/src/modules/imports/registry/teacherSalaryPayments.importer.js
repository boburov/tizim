import mongoose from "mongoose";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { ROLES } from "../../../constants/roles.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import {
  branchFilter,
  userBranchCondition,
} from "../../../helpers/branchContext.helper.js";
import { normalizePhone } from "../../../utils/phone.js";
import * as salaryTransactionService from "../../teacherSalary/services/salaryTransaction.service.js";
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
};

const norm = (v) => String(v ?? "").trim().toLowerCase();
const dateKey = (d) => d.toISOString().slice(0, 10);

// SalaryTransaction'da idempotencyKey maydoni YO'Q (u faqat o'quvchi
// to'lovlarida bor), shuning uchun takrorni mazmuni bo'yicha aniqlaymiz:
// bir xil maosh + summa + sana = o'sha to'lov.
const rowKey = (d) => `${d.salaryId}|${d.amount}|${dateKey(d.paidAt)}`;

const teacherSalaryPaymentsImporter = {
  key: "teacher-salary-payments",
  label: "O'qituvchi maosh to'lovlari",
  fileBase: "oqituvchi-maosh-import",
  sheetName: "Maosh to'lovlari",
  permission: PERMISSIONS.SALARY_PAY,

  // NEGA "Asosiy maosh", "Bonus", "Jarima", "Jami maosh" ustunlari YO'Q:
  // bu tizimda maosh SUMMASI kiritilmaydi - u hisoblanadi. TeacherSalary
  // hujjatidagi expectedAmount guruh tushumi, foiz stavkasi va ishlagan
  // kunlar (proratsiya) asosida recalc() tomonidan chiqariladi. Modelda
  // bonus/jarima maydonlari umuman mavjud emas.
  // Shuning uchun bu import maosh TO'LOVLARINI (chiqim) kiritadi -
  // ya'ni "kimga qancha pul berildi", "maosh qancha bo'lishi kerak"ni emas.
  columns: [
    {
      key: "teacherRef",
      header: "O'qituvchi ID (login yoki telefon)",
      width: 28,
      required: true,
      example: "dilnoza.k",
      note: "O'qituvchining tizimdagi logini yoki telefon raqami. Majburiy.",
    },
    {
      key: "teacherName",
      header: "O'qituvchi F.I.O (tekshirish uchun)",
      width: 26,
      required: false,
      example: "Dilnoza Karimova",
      note: "Ixtiyoriy. To'ldirilsa, login bo'yicha topilgan o'qituvchi ismi bilan solishtiriladi.",
    },
    {
      key: "groupName",
      header: "Guruh",
      width: 22,
      required: true,
      example: "Ingliz tili A1",
      note: "Maosh har bir GURUH uchun alohida hisoblanadi, shuning uchun guruh majburiy.",
    },
    {
      key: "year",
      header: "Yil",
      width: 10,
      required: true,
      example: 2025,
      note: "Maosh qaysi oyga tegishli ekani.",
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
      header: "To'langan summa (so'm)",
      width: 20,
      required: true,
      example: 2000000,
      note: "Musbat butun son. Maosh qoldig'idan oshib keta olmaydi.",
    },
    {
      key: "method",
      header: "To'lov turi",
      width: 14,
      required: true,
      example: "naqd",
      note: "naqd yoki karta. Majburiy.",
    },
    {
      key: "paidAt",
      header: "To'lov sanasi",
      width: 16,
      required: true,
      example: "2025-07-05",
      note: "2025-07-05 yoki 05.07.2025. Kelajak sana bo'lishi mumkin emas.",
    },
    {
      key: "note",
      header: "Izoh",
      width: 30,
      required: false,
      example: "Iyun oyi maoshi",
      note: "Ixtiyoriy izoh.",
    },
  ],

  prepare: async (rawRows) => {
    const refs = new Set();
    for (const raw of rawRows) {
      if (!isBlank(raw.teacherRef)) refs.add(norm(raw.teacherRef));
    }

    const phones = [...refs].map(normalizePhone).filter(Boolean);
    const branchCond = userBranchCondition();
    const teacherFilter = {
      role: ROLES.TEACHER,
      isDeleted: { $ne: true },
      $or: [{ username: { $in: [...refs] } }, { phone: { $in: phones } }],
    };
    if (branchCond) teacherFilter.$and = [branchCond];

    const teachers = await User.find(teacherFilter, {
      firstName: 1,
      lastName: 1,
      username: 1,
      phone: 1,
    }).lean();

    const teacherByRef = new Map();
    for (const t of teachers) {
      if (t.username) teacherByRef.set(norm(t.username), t);
      if (t.phone) teacherByRef.set(norm(t.phone), t);
    }

    const groups = await Group.find(
      { ...branchFilter(), isDeleted: { $ne: true } },
      { name: 1, isActive: 1, branchId: 1 },
    ).lean();
    const groupByName = new Map();
    for (const g of groups) {
      const k = norm(g.name);
      if (groupByName.has(k)) groupByName.set(k, "AMBIGUOUS");
      else groupByName.set(k, g);
    }

    const teacherIds = [...new Set(teachers.map((t) => String(t._id)))].map(
      (id) => new mongoose.Types.ObjectId(id),
    );
    const salaries = teacherIds.length
      ? await TeacherSalary.find(
          {
            ...branchFilter(),
            teacher: { $in: teacherIds },
            group: { $in: groups.map((g) => g._id) },
          },
          { teacher: 1, group: 1, year: 1, month: 1, expectedAmount: 1, paidAmount: 1 },
        ).lean()
      : [];

    const salaryByKey = new Map();
    for (const s of salaries) {
      salaryByKey.set(`${s.teacher}|${s.group}|${s.year}|${s.month}`, s);
    }

    // Mavjud maosh to'lovlari - takrorni ko'rib chiqish bosqichida aniqlash uchun.
    const existingKeys = new Set();
    if (salaries.length) {
      const txs = await SalaryTransaction.find(
        { salary: { $in: salaries.map((s) => s._id) }, isDeleted: { $ne: true } },
        { salary: 1, amount: 1, paidAt: 1 },
      ).lean();
      for (const t of txs) {
        existingKeys.add(`${t.salary}|${t.amount}|${dateKey(new Date(t.paidAt))}`);
      }
    }

    return { teacherByRef, groupByName, salaryByKey, existingKeys };
  },

  validateRow: (raw, ctx) => {
    const errors = [];
    const push = (field, message) => errors.push({ field, message });

    const refRes = asText(raw.teacherRef);
    const ref = norm(refRes.value);
    let teacher = null;
    if (!ref) push("O'qituvchi ID", "Bo'sh");
    else {
      teacher = ctx.teacherByRef.get(ref) || ctx.teacherByRef.get(norm(normalizePhone(ref)));
      if (!teacher) push("O'qituvchi ID", "Bunday o'qituvchi topilmadi (yoki boshqa filialda)");
    }

    if (teacher && !isBlank(raw.teacherName)) {
      const given = norm(raw.teacherName).replace(/\s+/g, " ");
      const actual = norm(`${teacher.firstName} ${teacher.lastName || ""}`).replace(/\s+/g, " ");
      const reversed = norm(`${teacher.lastName || ""} ${teacher.firstName}`).replace(/\s+/g, " ");
      if (given !== actual && given !== reversed) {
        push("O'qituvchi F.I.O", `Login bilan mos emas (bazada: ${teacher.firstName} ${teacher.lastName || ""})`);
      }
    }

    const groupRes = asText(raw.groupName);
    let group = null;
    if (!groupRes.value) push("Guruh", "Bo'sh");
    else {
      const found = ctx.groupByName.get(norm(groupRes.value));
      if (found === "AMBIGUOUS") push("Guruh", "Bu nomda bir nechta guruh bor - nomni aniqlashtiring");
      else if (!found) push("Guruh", "Bunday guruh topilmadi (yoki boshqa filialda)");
      else group = found;
    }

    const yearRes = asYear(raw.year);
    if (!yearRes.ok) push("Yil", yearRes.error);
    const monthRes = asMonth(raw.month);
    if (!monthRes.ok) push("Oy", monthRes.error);

    const amountRes = asMoney(raw.amount, { min: 1 });
    if (!amountRes.ok) push("To'langan summa", amountRes.error);

    const methodRes = asEnum(raw.method, METHOD_MAP);
    if (!methodRes.ok) push("To'lov turi", methodRes.error);

    const dateRes = asDate(raw.paidAt);
    if (!dateRes.ok) push("To'lov sanasi", dateRes.error);

    const noteRes = asText(raw.note, { max: 300 });
    if (!noteRes.ok) push("Izoh", noteRes.error);

    // ── Maosh hujjati ──
    let salary = null;
    if (teacher && group && yearRes.ok && monthRes.ok) {
      salary = ctx.salaryByKey.get(
        `${teacher._id}|${group._id}|${yearRes.value}|${monthRes.value}`,
      );
      if (!salary) {
        push(
          "Oy",
          "Bu o'qituvchi uchun shu guruh va oyda maosh hujjati yo'q " +
            "(o'qituvchi o'sha oyda guruhga biriktirilmagan yoki maosh hali hisoblanmagan)",
        );
      } else if (amountRes.ok) {
        // Qoldiqdan oshgan to'lovni servis baribir rad etadi, lekin uni
        // KO'RIB CHIQISH bosqichida aytish ancha foydali: foydalanuvchi
        // faylni tuzatib qayta yuklaydi, yarim import qilib qo'ymaydi.
        const remaining = Math.max(0, (salary.expectedAmount || 0) - (salary.paidAmount || 0));
        if (amountRes.value > remaining) {
          push(
            "To'langan summa",
            `Qoldiqdan oshib ketadi (qoldiq: ${remaining.toLocaleString("uz-UZ")} so'm)`,
          );
        }
      }
    }

    if (errors.length) return { errors, data: null };

    return {
      errors: [],
      data: {
        salaryId: salary._id,
        teacherName: `${teacher.firstName} ${teacher.lastName || ""}`.trim(),
        groupName: group.name,
        year: yearRes.value,
        month: monthRes.value,
        amount: amountRes.value,
        method: methodRes.value,
        paidAt: dateRes.value,
        note: noteRes.value,
      },
    };
  },

  dedupeKey: (data) => (data ? rowKey(data) : null),

  // Maosh to'lovi CHIQIM - filialning chiqim limitidan oshsa servis
  // to'lamaydi, "tasdiq kutilmoqda" so'rovi yaratadi. Import buni XATO
  // deb hisoblamaydi: pul chiqmadi, lekin so'rov yozildi - foydalanuvchi
  // hisobotda aniq ko'radi. Aks holda import limit nazoratini aylanib
  // o'tgan bo'lardi.
  commitRow: async (data, _ctx, { currentUser }) => {
    const result = await salaryTransactionService.create(
      {
        salaryId: data.salaryId,
        amount: data.amount,
        method: data.method,
        paidAt: data.paidAt,
        note: data.note || "Excel import",
      },
      currentUser,
    );

    if (result?.pendingApproval) {
      return {
        status: ROW_STATUS.PENDING,
        message: "Chiqim limitidan oshdi - tasdiqqa yuborildi",
      };
    }
    return { status: ROW_STATUS.IMPORTED, message: null };
  },
};

export default teacherSalaryPaymentsImporter;
