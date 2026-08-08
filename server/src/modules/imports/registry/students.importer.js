import { PERMISSIONS } from "../../../constants/permissions.js";
import { ROLES } from "../../../constants/roles.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import { toUtcMidnight } from "../../../helpers/attendance.helper.js";
import * as authService from "../../auth/services/auth.service.js";
import * as groupsService from "../../groups/services/groups.service.js";
import { ROW_STATUS } from "../services/importEngine.service.js";
import { asDate, asEnum, isBlank } from "../services/coerce.service.js";
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
  previewStudentRow,
  loadGroupFees,
} from "./userImportBase.js";

const norm = (v) => String(v ?? "").trim().toLowerCase();

const GENDER_MAP = {
  erkak: "male",
  "o'g'il": "male",
  ogil: "male",
  male: "male",
  m: "male",
  ayol: "female",
  qiz: "female",
  female: "female",
  f: "female",
};

/**
 * O'QUVCHI IMPORTI (jadval rejimi).
 *
 * ─── ENG MUHIM MAYDON: "Guruhga qo'shilgan sana" ───
 * O'quvchi guruhga qo'shilganda tizim A'ZOLIK SANASIDAN BUGUNGACHA har
 * oy uchun proratsiyalangan to'lov qatorini avtomatik quradi
 * (groups.service.js -> ensureFinanceForMembershipRange). Ya'ni bu sana
 * bir oy orqaga surilsa - bir oylik qarz qo'shiladi.
 *
 * Shuning uchun u jadvalda ALOHIDA ustun bo'lib turadi, guruh boshlanish
 * sanasi bilan avtomatik to'ldiriladi va yonida hisoblangan
 * "Oylar / Taxminiy hisob / Yakuniy balans" ustunlari ko'rinadi.
 */
const studentsImporter = {
  key: "students",
  label: "O'quvchilar",
  fileBase: "oquvchilar-import",
  sheetName: "O'quvchilar",
  // O'quvchi yaratish huquqi. Boshlang'ich QOLDIQ yozilgan qatorlar
  // uchun bundan tashqari FINANCE_MANAGE ham tekshiriladi (validateRow) -
  // o'quvchi qo'sha oladigan resepshin avtomatik ravishda pul yozish
  // huquqini OLMASLIGI kerak.
  permission: PERMISSIONS.STUDENTS_CREATE,
  gridEnabled: true,

  columns: [
    ...IDENTITY_COLUMNS,
    {
      key: "gender",
      header: "Jins",
      width: 12,
      example: "erkak",
      note: "Ixtiyoriy: erkak / ayol",
    },
    {
      key: "enrolledAt",
      header: "Ro'yxatga olingan sana",
      width: 22,
      example: "2026-05-05",
      note:
        "MAJBURIY. Kelajakda bo'lmasin. Bo'sh qoldirilsa guruh boshlanish " +
        "sanasi qo'yiladi.",
    },
    {
      key: "groupName",
      header: "Guruh",
      width: 22,
      example: "IELTS-A1",
      note:
        "Guruh nomi AYNAN tizimdagidek bo'lsin. Yangi guruh AVTOMATIK " +
        "YARATILMAYDI. Boshlang'ich qarz (-) kiritilsa guruh MAJBURIY.",
    },
    {
      key: "joinedAt",
      header: "Guruhga qo'shilgan sana",
      width: 24,
      example: "2026-05-05",
      note:
        "DIQQAT: shu sanadan bugungacha HAR OY uchun to'lov qatori " +
        "yaratiladi. Bo'sh qoldirilsa guruh boshlanish sanasi olinadi. " +
        "Guruh boshlanishidan oldin bo'lishi mumkin emas.",
    },
    OPENING_COLUMN,
    NOTE_COLUMN,
  ],

  // ── Ommaviy qidiruvlar ──
  prepare: async (rawRows, actor) => {
    const ctx = await prepareUserContext(rawRows, { role: ROLES.STUDENT, actor });

    // Preview uchun: guruh id -> guruh, guruh id -> oylik tarif.
    ctx.groupById = new Map();
    for (const g of ctx.groupByName.values()) ctx.groupById.set(String(g._id), g);
    ctx.feeByGroup = await loadGroupFees([...ctx.groupById.keys()]);

    return ctx;
  },

  draftRow: (raw, ctx) => draftUserRow(raw, ctx, { role: ROLES.STUDENT }),

  validateRow: (raw, ctx) => {
    const { errors, data } = validateUserRow(raw, ctx, { role: ROLES.STUDENT });

    // ── Jins ──
    if (!isBlank(raw.gender)) {
      const g = asEnum(raw.gender, GENDER_MAP);
      if (!g.ok) errors.push({ field: "gender", message: "Jins: erkak yoki ayol" });
      else data.gender = g.value;
    }

    // ── Ro'yxatga olingan sana (majburiy) ──
    const enrolled = asDate(raw.enrolledAt);
    if (!enrolled.ok) {
      errors.push({ field: "enrolledAt", message: enrolled.error });
    } else {
      data.enrolledAt = enrolled.value;
    }

    // ── Guruh ──
    const groupName = norm(raw.groupName);
    let group = null;
    if (groupName) {
      group = ctx.groupByName.get(groupName);
      if (!group) {
        // AVTOMATIK YARATMAYMIZ - ataylab. Bitta xato harf ("IELTS Beginer")
        // jimgina yangi guruh tug'dirardi va o'quvchi yolg'iz o'zi o'sha
        // guruhda qolardi. Xato ko'rinib tursin.
        errors.push({
          field: "groupName",
          message: `"${raw.groupName}" guruhi topilmadi. Nomni tekshiring yoki avval guruhni yarating`,
        });
      } else {
        data.groupId = String(group._id);
        data.groupName = group.name;
      }
    }

    // ── A'zolik sanasi ──
    if (group) {
      const groupStart = toUtcMidnight(group.startDate || group.createdAt);
      if (!isBlank(raw.joinedAt)) {
        const j = asDate(raw.joinedAt);
        if (!j.ok) errors.push({ field: "joinedAt", message: j.error });
        else if (groupStart && j.value.getTime() < groupStart.getTime()) {
          errors.push({
            field: "joinedAt",
            message: `Guruh ${groupStart.toISOString().slice(0, 10)} da boshlangan - undan oldin qo'shib bo'lmaydi`,
          });
        } else {
          data.joinedAt = j.value;
        }
      } else {
        data.joinedAt = groupStart;
      }

      // A'ZOLIK SANASI RO'YXATGA OLINGAN SANADAN OLDIN BO'LMASIN.
      //
      // Bu qoida addStudent() ichida ham bor va u YOZISH paytida
      // xato beradi. Lekin o'shanda foydalanuvchi allaqachon
      // yaratilgan bo'ladi - ya'ni qator "yarim bajarilgan" holatda
      // qoladi (odam bor, guruhi yo'q). Shuning uchun bu yerda,
      // YOZISHDAN OLDIN ushlaymiz va jadvalda ko'rsatamiz.
      if (
        data.joinedAt &&
        data.enrolledAt &&
        data.joinedAt.getTime() < data.enrolledAt.getTime()
      ) {
        errors.push({
          field: "enrolledAt",
          message:
            "Ro'yxatga olingan sana guruhga qo'shilgan sanadan keyin turibdi - " +
            `uni ${data.joinedAt.toISOString().slice(0, 10)} yoki undan oldingi kunga o'zgartiring`,
        });
      }
    }

    // ── Boshlang'ich QARZ uchun guruh majburiy ──
    //
    // StudentPayment guruhsiz bo'lolmaydi (model talabi). Guruhsiz qarz
    // yozib bo'lmaydi, shuning uchun xato ANIQ ko'rsatiladi - aks holda
    // materializatsiya yozish paytida yiqilardi va odam "qoldig'i bor,
    // lekin hech qayerda ko'rinmaydi" holatida qolardi.
    if ((data.openingBalance || 0) < 0 && !data.groupId) {
      errors.push({
        field: "groupName",
        message: "Boshlang'ich qarz (-) uchun guruh tanlanishi shart",
      });
    }

    return { errors, data };
  },

  // Fayl ichidagi takror: login har doim yagona bo'lishi kerak.
  dedupeKey: (data) => (data?.username ? `u:${data.username}` : null),

  previewRow: (data, ctx) => previewStudentRow(data, ctx),

  /**
   * QATORNI YOZADI. Tartib QAT'IY:
   *   1) foydalanuvchi,
   *   2) guruhga qo'shish  → o'tgan oylar to'lovi shu yerda yaratiladi,
   *   3) boshlang'ich qoldiq → depozit avans o'sha qarzlarni yopadi.
   * 2 va 3 o'rin almashsa avans yopadigan qarz hali mavjud bo'lmas edi.
   */
  commitRow: async (data, ctx, { currentUser, importJobId } = {}) => {
    const messages = [];

    // ── 1) FOYDALANUVCHI ──
    let user = findExistingUser(data, ctx);
    let created = false;

    if (user) {
      if (user.role !== ROLES.STUDENT) {
        throw new ApiError(
          400,
          `Bu telefon va ism ${user.role} rolidagi foydalanuvchiga tegishli`,
        );
      }
      messages.push("Mavjud o'quvchi topildi");
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
              role: ROLES.STUDENT,
              gender: payload.gender || null,
              birthDate: payload.birthDate || null,
              enrolledAt: payload.enrolledAt,
              homeBranchId: payload.branchId,
            },
            {
              allowedBranchIds: ctx.allowedBranchIds,
              canSeeAllBranches: ctx.canSeeAll,
              userId: currentUser?._id || null,
            },
          ),
        data,
      );
      created = true;
    }

    // ── 2) GURUHGA QO'SHISH ──
    // Bu chaqiruv a'zolik sanasidan bugungacha HAR OY uchun to'lov
    // qatorini quradi (ensureFinanceForMembershipRange).
    if (data.groupId) {
      const already = await GroupMembership.findOne({
        group: data.groupId,
        student: user._id,
        leftAt: null,
        isDeleted: { $ne: true },
      }).lean();

      if (already) {
        messages.push("Allaqachon shu guruhda");
      } else {
        await groupsService.addStudent(data.groupId, user._id, {
          joinedAt: data.joinedAt,
        });
        messages.push(`"${data.groupName}" guruhiga qo'shildi`);
      }
    }

    // ── 3) BOSHLANG'ICH QOLDIQ ──
    if (data.openingBalance) {
      const res = await applyOpeningBalance(
        {
          user,
          role: ROLES.STUDENT,
          data,
          groupId: data.groupId,
          joinedAt: data.joinedAt,
        },
        { currentUser, importJobId },
      );
      if (res?.status === "duplicate") {
        messages.push("Boshlang'ich qoldiq allaqachon kiritilgan - qayta yozilmadi");
      } else if (data.openingBalance > 0) {
        messages.push(
          `Avans ${data.openingBalance.toLocaleString("ru-RU")} so'm - eski qarzlarga taqsimlandi`,
        );
      } else {
        messages.push(
          `Boshlang'ich qarz ${Math.abs(data.openingBalance).toLocaleString("ru-RU")} so'm`,
        );
      }
    }

    if (!created && !data.groupId && !data.openingBalance) {
      logger.info(
        { user: String(user._id) },
        "Import qatori hech narsa o'zgartirmadi (mavjud o'quvchi, guruh va qoldiq yo'q)",
      );
    }

    return { status: ROW_STATUS.IMPORTED, message: messages.join("; ") };
  },
};

export default studentsImporter;
