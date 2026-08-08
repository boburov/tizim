import { PERMISSIONS } from "../../../constants/permissions.js";
import { ROLES } from "../../../constants/roles.js";
import ApiError from "../../../utils/ApiError.js";
import {
  COMP_BASE_TYPES,
  COMP_VARIABLE_TYPES,
  COMP_PERCENT_BASES,
} from "../../../models/teacherCompensation.model.js";
import * as authService from "../../auth/services/auth.service.js";
import { ROW_STATUS } from "../services/importEngine.service.js";
import { asDate, asNumber, asEnum, isBlank } from "../services/coerce.service.js";
import {
  IDENTITY_COLUMNS,
  OPENING_COLUMN,
  NOTE_COLUMN,
  prepareUserContext,
  draftUserRow,
  validateUserRow,
  findExistingUser,
  createUserWithUniqueLogin,
  applyOpeningBalance,
} from "./userImportBase.js";

const norm = (v) => String(v ?? "").trim().toLowerCase();

const BASE_TYPE_MAP = {
  "yo'q": "none",
  yoq: "none",
  none: "none",
  fiksa: "fixed_monthly",
  "oylik": "fixed_monthly",
  fixed: "fixed_monthly",
  fixed_monthly: "fixed_monthly",
};

const VARIABLE_TYPE_MAP = {
  "yo'q": "none",
  yoq: "none",
  none: "none",
  foiz: "percent",
  percent: "percent",
  "o'quvchi": "per_student",
  oquvchi: "per_student",
  per_student: "per_student",
  soat: "per_lesson_hour",
  per_lesson_hour: "per_lesson_hour",
  guruh: "per_group",
  per_group: "per_group",
};

const PERCENT_BASE_MAP = {
  hisoblangan: "billed",
  billed: "billed",
  yigilgan: "collected",
  "yig'ilgan": "collected",
  collected: "collected",
};

/**
 * O'QITUVCHI IMPORTI (jadval rejimi).
 *
 * ─── GURUH NEGA KERAK ───
 * O'qituvchining boshlang'ich qoldig'i TeacherSalary qatoriga aylanadi,
 * u esa GURUHSIZ bo'lolmaydi: to'lov yo'li (salaryTransaction.create ->
 * validateSalaryPayment) guruhni talab qiladi. Guruhsiz qator ekranda
 * ko'rinardi-yu, uni hech qachon to'lab bo'lmasdi.
 *
 * Shuning uchun guruh FAQAT qoldiq kiritilganda majburiy. Qoldiqsiz
 * o'qituvchi guruhsiz ham yaratilaveradi.
 *
 * ─── GURUHGA BIRIKTIRISH BU YERDA QILINMAYDI ───
 * O'qituvchini guruhga biriktirish alohida amal (dars jadvali
 * to'qnashuvi, maosh davri, o'quvchilarga bildirishnoma). Uni importga
 * qo'shish "guruhni jimgina boshqa o'qituvchiga o'tkazish" xavfini
 * tug'dirardi. Guruh ustuni bu yerda faqat qoldiq qatorini bog'lash uchun.
 */
const teachersImporter = {
  key: "teachers",
  label: "O'qituvchilar",
  fileBase: "oqituvchilar-import",
  sheetName: "O'qituvchilar",
  permission: PERMISSIONS.TEACHERS_CREATE,
  gridEnabled: true,

  columns: [
    ...IDENTITY_COLUMNS,
    {
      key: "hiredAt",
      header: "Ishga olingan sana",
      width: 20,
      example: "2026-05-05",
      note: "MAJBURIY. Maosh davri shu sanadan boshlanadi. Kelajakda bo'lmasin.",
    },
    {
      key: "baseType",
      header: "Fiksa turi",
      width: 14,
      example: "fiksa",
      note: "yo'q / fiksa. Bo'sh qoldirilsa - yo'q.",
    },
    {
      key: "baseAmount",
      header: "Fiksa oylik",
      width: 16,
      example: "2000000",
      note: "Fiksa turi tanlanganda majburiy.",
    },
    {
      key: "variableType",
      header: "O'zgaruvchi turi",
      width: 18,
      example: "foiz",
      note: "yo'q / foiz / o'quvchi / soat / guruh",
    },
    {
      key: "variableRate",
      header: "O'zgaruvchi stavka",
      width: 18,
      example: "40",
      note: "Foizda 0-100, boshqalarda so'm miqdori.",
    },
    {
      key: "percentBase",
      header: "Foiz bazasi",
      width: 16,
      example: "yig'ilgan",
      note: "Foiz tanlanganda: hisoblangan / yig'ilgan",
    },
    {
      key: "groupName",
      header: "Guruh (qoldiq uchun)",
      width: 22,
      example: "IELTS-A1",
      note:
        "Faqat boshlang'ich qoldiq kiritilganda majburiy. O'qituvchi bu " +
        "guruhga BIRIKTIRILMAYDI - qoldiq qatori shu guruhga bog'lanadi, " +
        "chunki maosh to'lovi guruhsiz ishlamaydi.",
    },
    OPENING_COLUMN,
    NOTE_COLUMN,
  ],

  prepare: async (rawRows, actor) =>
    prepareUserContext(rawRows, { role: ROLES.TEACHER, actor }),

  draftRow: (raw, ctx) => draftUserRow(raw, ctx, { role: ROLES.TEACHER }),

  validateRow: (raw, ctx) => {
    const { errors, data } = validateUserRow(raw, ctx, { role: ROLES.TEACHER });

    // ── Ishga olingan sana (majburiy) ──
    const hired = asDate(raw.hiredAt);
    if (!hired.ok) errors.push({ field: "hiredAt", message: hired.error });
    else data.hiredAt = hired.value;

    // ── Maosh stavkasi (ixtiyoriy, lekin qismlari mos bo'lsin) ──
    const baseType = isBlank(raw.baseType)
      ? "none"
      : asEnum(raw.baseType, BASE_TYPE_MAP, { fallback: "none" }).value;
    const variableType = isBlank(raw.variableType)
      ? "none"
      : asEnum(raw.variableType, VARIABLE_TYPE_MAP, { fallback: "none" }).value;

    if (!COMP_BASE_TYPES.includes(baseType)) {
      errors.push({ field: "baseType", message: "Fiksa turi: yo'q / fiksa" });
    }
    if (!COMP_VARIABLE_TYPES.includes(variableType)) {
      errors.push({
        field: "variableType",
        message: "O'zgaruvchi turi: yo'q / foiz / o'quvchi / soat / guruh",
      });
    }

    let baseAmount = 0;
    if (baseType === "fixed_monthly") {
      const v = asNumber(raw.baseAmount, { min: 0, max: 1_000_000_000, integer: true });
      if (!v.ok) {
        errors.push({ field: "baseAmount", message: "Fiksa oylik summasi kerak" });
      } else baseAmount = v.value;
    }

    let variableRate = 0;
    let percentBase = "billed";
    if (variableType !== "none") {
      const v = asNumber(raw.variableRate, { min: 0, max: 1_000_000_000 });
      if (!v.ok) {
        errors.push({ field: "variableRate", message: "O'zgaruvchi stavka kerak" });
      } else if (variableType === "percent" && v.value > 100) {
        errors.push({ field: "variableRate", message: "Foiz 100 dan oshmasin" });
      } else variableRate = v.value;

      if (variableType === "percent") {
        const b = asEnum(raw.percentBase, PERCENT_BASE_MAP, { fallback: "billed" });
        if (!b.ok || !COMP_PERCENT_BASES.includes(b.value)) {
          errors.push({
            field: "percentBase",
            message: "Foiz bazasi: hisoblangan / yig'ilgan",
          });
        } else percentBase = b.value;
      }
    }

    // MAOSH BELGILANMASA - OGOHLANTIRISH, xato emas.
    // Sababi mavjud xulq-atvor: forma ham "keyinroq belgilayman" ga
    // ruxsat beradi. Lekin importda buni ko'rsatmasak, 30 ta o'qituvchi
    // maoshsiz yaratilib, oy oxirida hech kimga hech narsa hisoblanmasdi.
    if (baseType === "none" && variableType === "none") {
      data.compensationWarning =
        "Maosh belgilanmagan - o'qituvchi profilidan kiritish kerak";
    } else {
      data.compensation = {
        baseType,
        baseAmount,
        variableType,
        variableRate,
        percentBase,
      };
    }

    // ── Guruh (faqat qoldiq uchun) ──
    const groupName = norm(raw.groupName);
    if (groupName) {
      const group = ctx.groupByName.get(groupName);
      if (!group) {
        errors.push({
          field: "groupName",
          message: `"${raw.groupName}" guruhi topilmadi`,
        });
      } else {
        data.groupId = String(group._id);
        data.groupName = group.name;
      }
    }

    if (data.openingBalance && !data.groupId) {
      errors.push({
        field: "groupName",
        message:
          "Boshlang'ich qoldiq uchun guruh tanlanishi shart (maosh to'lovi guruhsiz ishlamaydi)",
      });
    }

    return { errors, data };
  },

  dedupeKey: (data) => (data?.username ? `u:${data.username}` : null),

  previewRow: (data) => ({
    opening: data.openingBalance || 0,
    // O'qituvchida "necha oy" hisoblanmaydi: guruhga biriktirish bu
    // importda qilinmaydi, ya'ni o'tgan oylar maoshi yaratilmaydi.
    direction:
      (data.openingBalance || 0) > 0
        ? "O'qituvchi bizga qarz (keyingi oylikdan ushlanadi)"
        : (data.openingBalance || 0) < 0
          ? "Biz o'qituvchiga qarzmiz (to'lanadi)"
          : "",
    warning:
      [data.duplicateNameWarning, data.compensationWarning, data.openingWarning]
        .filter(Boolean)
        .join(". ") || null,
  }),

  commitRow: async (data, ctx, { currentUser, importJobId } = {}) => {
    const messages = [];

    let user = findExistingUser(data, ctx);
    if (user) {
      if (user.role !== ROLES.TEACHER) {
        throw new ApiError(
          400,
          `Bu telefon va ism ${user.role} rolidagi foydalanuvchiga tegishli`,
        );
      }
      messages.push("Mavjud o'qituvchi topildi");
    } else {
      user = await createUserWithUniqueLogin(
        (payload) =>
          authService.registerUser(
            {
              firstName: payload.firstName,
              lastName: payload.lastName,
              username: payload.username,
              password: payload.password,
              phone: payload.phone,
              role: ROLES.TEACHER,
              birthDate: payload.birthDate || null,
              hiredAt: payload.hiredAt,
              homeBranchId: payload.branchId,
              compensation: payload.compensation,
            },
            {
              allowedBranchIds: ctx.allowedBranchIds,
              canSeeAllBranches: ctx.canSeeAll,
              userId: currentUser?._id || null,
            },
          ),
        data,
      );
      messages.push(
        data.compensation ? "Yaratildi (maosh stavkasi bilan)" : "Yaratildi (maoshsiz)",
      );
    }

    if (data.openingBalance) {
      const res = await applyOpeningBalance(
        { user, role: ROLES.TEACHER, data, groupId: data.groupId },
        { currentUser, importJobId },
      );
      if (res?.status === "duplicate") {
        messages.push("Boshlang'ich qoldiq allaqachon kiritilgan - qayta yozilmadi");
      } else {
        messages.push(
          data.openingBalance > 0
            ? `Avans ${data.openingBalance.toLocaleString("ru-RU")} so'm - keyingi oylikdan ushlanadi`
            : `Qoldiq ${Math.abs(data.openingBalance).toLocaleString("ru-RU")} so'm - to'lanishi kerak`,
        );
      }
    }

    return { status: ROW_STATUS.IMPORTED, message: messages.join("; ") };
  },
};

export default teachersImporter;
