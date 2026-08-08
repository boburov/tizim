import { PERMISSIONS } from "../../../constants/permissions.js";
import { ROLES } from "../../../constants/roles.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { STAFF_SALARY_TYPES } from "../../../models/staffCompensation.model.js";
import * as usersService from "../../users/services/users.service.js";
import * as staffCompensationService from "../../staffPayroll/services/staffCompensation.service.js";
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

const SALARY_TYPE_MAP = {
  fiksa: "fixed",
  oylik: "fixed",
  fixed: "fixed",
  "fiksa+kpi": "fixed_plus_kpi",
  "fiksa + kpi": "fixed_plus_kpi",
  fixed_plus_kpi: "fixed_plus_kpi",
  kpi: "kpi_only",
  kpi_only: "kpi_only",
  "faqat kpi": "kpi_only",
};

/**
 * XODIM IMPORTI (direktor, administrator, resepshin va h.k.).
 *
 * O'QITUVCHIDAN FARQI: rol DINAMIK (Role kolleksiyasidan, owner o'zi
 * yaratgan rollar ham) va maosh boshqa modelda (StaffCompensation).
 *
 * ─── BOSHLANG'ICH QARZ QIRQILMAYDI ───
 * Xodimning qarzi oylik maoshidan katta bo'lsa, o'sha oy 0 to'lanadi va
 * QOLDIG'I KEYINGI OYGA ko'chiriladi (staffPayroll.service.js ->
 * carryOverOpeningDebt). Jarima uchun bunday emas - u qirqiladi. Farq
 * ataylab: jarima qarori, qoldiq esa haqiqiy pul.
 */
const staffImporter = {
  key: "staff",
  label: "Xodimlar",
  fileBase: "xodimlar-import",
  sheetName: "Xodimlar",
  // Ikkita huquq - users.routes.js dagi /staff yo'li bilan bir xil
  // mulohaza: bu amal odam yaratadi VA rol biriktiradi.
  permission: PERMISSIONS.TEACHERS_CREATE,
  extraPermissions: [PERMISSIONS.ROLES_UPDATE],
  gridEnabled: true,

  columns: [
    ...IDENTITY_COLUMNS,
    {
      key: "roleName",
      header: "Rol",
      width: 18,
      required: true,
      example: "administrator",
      note: "MAJBURIY. Tizimdagi rol nomi yoki kodi (masalan: administrator).",
    },
    {
      key: "hiredAt",
      header: "Ishga olingan sana",
      width: 20,
      example: "2026-05-05",
      note: "Bo'sh qoldirilsa bugungi sana.",
    },
    {
      key: "salaryType",
      header: "Maosh turi",
      width: 16,
      example: "fiksa",
      note: "fiksa / fiksa+kpi / kpi. Bo'sh qoldirilsa maosh belgilanmaydi.",
    },
    {
      key: "baseAmount",
      header: "Oylik summa",
      width: 16,
      example: "3000000",
      note: "fiksa va fiksa+kpi uchun majburiy.",
    },
    OPENING_COLUMN,
    NOTE_COLUMN,
  ],

  prepare: async (rawRows, actor) =>
    prepareUserContext(rawRows, { role: "staff", actor }),

  draftRow: (raw, ctx) => draftUserRow(raw, ctx, { role: "staff" }),

  validateRow: (raw, ctx) => {
    const { errors, data } = validateUserRow(raw, ctx, { role: "staff" });

    // ── Rol (majburiy, dinamik) ──
    const roleName = norm(raw.roleName);
    if (!roleName) {
      errors.push({ field: "roleName", message: "Rol majburiy" });
    } else {
      const role = ctx.roleByValue.get(roleName);
      if (!role) {
        errors.push({
          field: "roleName",
          message: `"${raw.roleName}" roli topilmadi. Avval rolni yarating`,
        });
      } else if (role.value === ROLES.STUDENT) {
        // O'quvchi xodim emas - u alohida importer bilan qo'shiladi
        // (u yerda guruh, ro'yxatga olingan sana va boshqa qoidalar bor).
        errors.push({
          field: "roleName",
          message: "O'quvchi roli bu importda ishlatilmaydi - \"O'quvchilar\" importidan foydalaning",
        });
      } else {
        data.roleValue = role.value;
        data.roleLabel = role.label || role.value;
      }
    }

    // ── Ishga olingan sana ──
    if (!isBlank(raw.hiredAt)) {
      const hired = asDate(raw.hiredAt);
      if (!hired.ok) errors.push({ field: "hiredAt", message: hired.error });
      else data.hiredAt = hired.value;
    }

    // ── Maosh ──
    if (!isBlank(raw.salaryType)) {
      const t = asEnum(raw.salaryType, SALARY_TYPE_MAP);
      if (!t.ok || !STAFF_SALARY_TYPES.includes(t.value)) {
        errors.push({ field: "salaryType", message: "Maosh turi: fiksa / fiksa+kpi / kpi" });
      } else {
        let baseAmount = 0;
        if (t.value !== "kpi_only") {
          const v = asNumber(raw.baseAmount, {
            min: 0,
            max: 1_000_000_000,
            integer: true,
          });
          if (!v.ok) {
            errors.push({ field: "baseAmount", message: "Oylik summa kerak" });
          } else baseAmount = v.value;
        }
        data.compensation = { salaryType: t.value, baseAmount };
      }
    } else if (data.openingBalance) {
      // MUHIM OGOHLANTIRISH: shartnomasiz xodimda oylik hisobi
      // qurilmaydi, ya'ni boshlang'ich QARZ hech qachon ushlab
      // qolinmaydi (ushlash uchun maosh kerak). Bu xato emas - qarz
      // yozilaveradi va kartochkada ko'rinadi - lekin odam buni
      // bilishi kerak.
      data.openingWarning =
        "Maosh turi ko'rsatilmagan - qarz avtomatik ushlanmaydi, faqat qayd etiladi";
    }

    return { errors, data };
  },

  dedupeKey: (data) => (data?.username ? `u:${data.username}` : null),

  previewRow: (data) => ({
    opening: data.openingBalance || 0,
    direction:
      (data.openingBalance || 0) > 0
        ? "Xodim bizga qarz (oylikdan ushlanadi, qoldig'i keyingi oyga ko'chadi)"
        : (data.openingBalance || 0) < 0
          ? "Biz xodimga qarzmiz (oylikka qo'shiladi)"
          : "",
    warning:
      [data.duplicateNameWarning, data.openingWarning].filter(Boolean).join(". ") ||
      null,
  }),

  commitRow: async (data, ctx, { currentUser, importJobId } = {}) => {
    const messages = [];

    let user = findExistingUser(data, ctx);
    if (user) {
      if (user.role === ROLES.STUDENT) {
        throw new ApiError(400, "Bu telefon va ism o'quvchiga tegishli");
      }
      messages.push("Mavjud xodim topildi");
    } else {
      user = await createUserWithUniqueLogin(
        (payload) =>
          usersService.createStaff(
            {
              firstName: payload.firstName,
              lastName: payload.lastName,
              username: payload.username,
              password: payload.password,
              phone: payload.phone,
              role: payload.roleValue,
              homeBranchId: payload.branchId,
              birthDate: payload.birthDate || null,
              hiredAt: payload.hiredAt || null,
            },
            currentUser,
          ),
        data,
      );
      messages.push(`Yaratildi (${data.roleLabel})`);

      // MAOSH SHARTNOMASI - alohida qadam.
      //
      // createStaff() o'qituvchi uchun `compensation` ni qabul qiladi,
      // lekin u TeacherCompensation'ga yozadi. Xodimniki boshqa model
      // (StaffCompensation), shuning uchun bu yerda ochiq chaqiriladi.
      //
      // Best-effort: stavkadagi xato XODIM YARATILISHINI bekor
      // QILMAYDI - u allaqachon bazada va uni o'chirish qaytarib
      // bo'lmaydigan zarar bo'lardi. Stavka profil orqali kiritiladi.
      if (data.compensation) {
        try {
          await staffCompensationService.setCompensation(
            {
              employee: user._id,
              branchId: data.branchId,
              salaryType: data.compensation.salaryType,
              baseAmount: data.compensation.baseAmount,
              effectiveFrom: data.hiredAt || undefined,
            },
            currentUser,
          );
          messages.push("Maosh stavkasi belgilandi");
        } catch (err) {
          logger.warn(
            { err: err?.message, user: String(user._id) },
            "Import: xodim maosh stavkasi belgilanmadi",
          );
          messages.push("DIQQAT: maosh stavkasi belgilanmadi - profildan kiriting");
        }
      }
    }

    if (data.openingBalance) {
      const res = await applyOpeningBalance(
        { user, role: "staff", data, groupId: null },
        { currentUser, importJobId },
      );
      if (res?.status === "duplicate") {
        messages.push("Boshlang'ich qoldiq allaqachon kiritilgan - qayta yozilmadi");
      } else {
        messages.push(
          data.openingBalance > 0
            ? `Avans ${data.openingBalance.toLocaleString("ru-RU")} so'm - oylikdan ushlanadi`
            : `Qoldiq ${Math.abs(data.openingBalance).toLocaleString("ru-RU")} so'm - to'lanishi kerak`,
        );
      }
    }

    return { status: ROW_STATUS.IMPORTED, message: messages.join("; ") };
  },
};

export default staffImporter;
