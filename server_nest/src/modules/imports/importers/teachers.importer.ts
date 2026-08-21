import { Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/errors/api-error.js';
import { ROLES, PERMISSIONS } from '../../../common/constants/permissions.js';
import {
  COMP_BASE_TYPES, COMP_VARIABLE_TYPES, COMP_PERCENT_BASES,
} from '../../../common/constants/compensation.js';
import { AuthService } from '../../auth/auth.service.js';
import { ROW_STATUS, type Importer } from '../import-engine.service.js';
import { asDate, asNumber, asEnum, isBlank } from '../coerce.js';
import {
  IDENTITY_COLUMNS, OPENING_COLUMN, NOTE_COLUMN, UserImportBaseService, norm,
} from './user-import-base.service.js';

const BASE_TYPE_MAP: Record<string, string> = {
  "yo'q": 'none', yoq: 'none', none: 'none',
  fiksa: 'fixed_monthly', oylik: 'fixed_monthly',
  fixed: 'fixed_monthly', fixed_monthly: 'fixed_monthly',
};

const VARIABLE_TYPE_MAP: Record<string, string> = {
  "yo'q": 'none', yoq: 'none', none: 'none',
  foiz: 'percent', percent: 'percent',
  "o'quvchi": 'per_student', oquvchi: 'per_student', per_student: 'per_student',
  soat: 'per_lesson_hour', per_lesson_hour: 'per_lesson_hour',
  guruh: 'per_group', per_group: 'per_group',
};

const PERCENT_BASE_MAP: Record<string, string> = {
  hisoblangan: 'billed', billed: 'billed',
  yigilgan: 'collected', "yig'ilgan": 'collected', collected: 'collected',
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI IMPORTI (jadval rejimi).
 *
 * ── GURUH NEGA KERAK ──
 * O'qituvchining boshlang'ich qoldig'i `TeacherSalary` qatoriga aylanadi.
 *
 * ── ⚠ GURUHGA BIRIKTIRISH BU YERDA QILINMAYDI ──
 * O'qituvchini guruhga biriktirish ALOHIDA amal (dars jadvali
 * to'qnashuvi, maosh davri, o'quvchilarga bildirishnoma). Uni importga
 * qo'shish "guruhni JIMGINA boshqa o'qituvchiga o'tkazish" xavfini
 * tug'dirardi. Guruh ustuni bu yerda FAQAT qoldiq qatorini bog'lash uchun.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class TeachersImporter implements Importer {
  readonly key = 'teachers';
  readonly label = "O'qituvchilar";
  readonly fileBase = 'oqituvchilar-import';
  readonly sheetName = "O'qituvchilar";
  readonly permission = PERMISSIONS.TEACHERS_CREATE;
  readonly gridEnabled = true;

  readonly columns = [
    ...IDENTITY_COLUMNS,
    {
      key: 'hiredAt', header: 'Ishga olingan sana', width: 20, primary: true,
      example: '2026-05-05',
      note: "MAJBURIY. Maosh davri shu sanadan boshlanadi. Kelajakda bo'lmasin.",
    },
    {
      key: 'baseType', header: 'Fiksa turi', width: 14, example: 'fiksa',
      note: "yo'q / fiksa. Bo'sh qoldirilsa - yo'q.",
    },
    {
      key: 'baseAmount', header: 'Fiksa oylik', width: 16, example: '2000000',
      note: 'Fiksa turi tanlanganda majburiy.',
    },
    {
      key: 'variableType', header: "O'zgaruvchi turi", width: 18, example: 'foiz',
      note: "yo'q / foiz / o'quvchi / soat / guruh",
    },
    {
      key: 'variableRate', header: "O'zgaruvchi stavka", width: 18, example: '40',
      note: "Foizda 0-100, boshqalarda so'm miqdori.",
    },
    {
      key: 'percentBase', header: 'Foiz bazasi', width: 16, example: "yig'ilgan",
      note: 'Foiz tanlanganda: hisoblangan / yig\'ilgan',
    },
    {
      key: 'groupName', header: 'Guruh (qoldiq uchun)', width: 22,
      optionsKey: 'groups', example: 'IELTS-A1',
      note:
        "Faqat boshlang'ich qoldiq kiritilganda majburiy. O'qituvchi bu " +
        'guruhga BIRIKTIRILMAYDI - qoldiq qatori shu guruhga bog\'lanadi, ' +
        "chunki maosh to'lovi guruhsiz ishlamaydi.",
    },
    OPENING_COLUMN,
    NOTE_COLUMN,
  ];

  constructor(
    private readonly base: UserImportBaseService,
    private readonly auth: AuthService,
  ) {}

  prepare(rawRows: any[], actor: any) {
    return this.base.prepareUserContext(rawRows, { role: ROLES.TEACHER, actor });
  }

  draftRow(raw: any, ctx: any) {
    return this.base.draftUserRow(raw, ctx, { role: ROLES.TEACHER });
  }

  validateRow(raw: any, ctx: any) {
    const { errors, data } = this.base.validateUserRow(raw, ctx, {
      role: ROLES.TEACHER,
    });

    // ── Ishga olingan sana (MAJBURIY) ──
    const hired = asDate(raw.hiredAt);
    if (!hired.ok) errors.push({ field: 'hiredAt', message: hired.error });
    else data.hiredAt = hired.value;

    // ── Maosh stavkasi (ixtiyoriy, lekin QISMLARI MOS bo'lsin) ──
    const baseType = isBlank(raw.baseType)
      ? 'none'
      : (asEnum(raw.baseType, BASE_TYPE_MAP, { fallback: 'none' }).value as string);
    const variableType = isBlank(raw.variableType)
      ? 'none'
      : (asEnum(raw.variableType, VARIABLE_TYPE_MAP, { fallback: 'none' }).value as string);

    if (!(COMP_BASE_TYPES as readonly string[]).includes(baseType)) {
      errors.push({ field: 'baseType', message: "Fiksa turi: yo'q / fiksa" });
    }
    if (!(COMP_VARIABLE_TYPES as readonly string[]).includes(variableType)) {
      errors.push({
        field: 'variableType',
        message: "O'zgaruvchi turi: yo'q / foiz / o'quvchi / soat / guruh",
      });
    }

    let baseAmount = 0;
    if (baseType === 'fixed_monthly') {
      const v = asNumber(raw.baseAmount, {
        min: 0, max: 1_000_000_000, integer: true,
      });
      if (!v.ok) {
        errors.push({ field: 'baseAmount', message: 'Fiksa oylik summasi kerak' });
      } else baseAmount = v.value as number;
    }

    let variableRate = 0;
    let percentBase = 'billed';
    if (variableType !== 'none') {
      const v = asNumber(raw.variableRate, { min: 0, max: 1_000_000_000 });
      if (!v.ok) {
        errors.push({ field: 'variableRate', message: "O'zgaruvchi stavka kerak" });
      } else if (variableType === 'percent' && (v.value as number) > 100) {
        errors.push({ field: 'variableRate', message: 'Foiz 100 dan oshmasin' });
      } else variableRate = v.value as number;

      if (variableType === 'percent') {
        const b = asEnum(raw.percentBase, PERCENT_BASE_MAP, { fallback: 'billed' });
        if (!b.ok || !(COMP_PERCENT_BASES as readonly string[]).includes(b.value as string)) {
          errors.push({
            field: 'percentBase',
            message: "Foiz bazasi: hisoblangan / yig'ilgan",
          });
        } else percentBase = b.value as string;
      }
    }

    // ⚠ MAOSH BELGILANMASA — OGOHLANTIRISH, XATO EMAS. Forma ham
    // "keyinroq belgilayman" ga ruxsat beradi. Lekin importda buni
    // ko'rsatmasak, 30 ta o'qituvchi MAOSHSIZ yaratilib, oy oxirida
    // hech kimga hech narsa hisoblanmasdi.
    if (baseType === 'none' && variableType === 'none') {
      data.compensationWarning =
        "Maosh belgilanmagan - o'qituvchi profilidan kiritish kerak";
    } else {
      data.compensation = {
        baseType, baseAmount, variableType, variableRate, percentBase,
      };
    }

    // ── Guruh (faqat qoldiq uchun) ──
    const groupName = norm(raw.groupName);
    if (groupName) {
      const group = ctx.groupByName.get(groupName);
      if (!group) {
        errors.push({
          field: 'groupName', message: `"${raw.groupName}" guruhi topilmadi`,
        });
      } else {
        data.groupId = String(group._id);
        data.groupName = group.name;
      }
    }

    // ⚠ GURUH SHART EMAS: boshlang'ich qoldiq MARKAZ darajasidagi
    // majburiyat va guruhsiz maosh qatori sifatida yoziladi. Ilgari u
    // majburiy edi va operator TASODIFIY guruh tanlashga majbur
    // bo'lardi — qarz o'sha guruhning XARAJATI bo'lib ko'rinardi.

    return { errors, data };
  }

  dedupeKey(data: any) {
    return data?.username ? `u:${data.username}` : null;
  }

  previewRow(data: any) {
    return {
      opening: data.openingBalance || 0,
      // ⚠ O'qituvchida "necha oy" HISOBLANMAYDI: guruhga biriktirish bu
      // importda qilinmaydi, ya'ni o'tgan oylar maoshi yaratilmaydi.
      direction:
        (data.openingBalance || 0) > 0
          ? "Biz o'qituvchiga qarzmiz (to'lanadi)"
          : (data.openingBalance || 0) < 0
            ? "O'qituvchi bizga qarz (keyingi oylikdan ushlanadi)"
            : '',
      warning:
        [data.duplicateNameWarning, data.compensationWarning, data.openingWarning]
          .filter(Boolean).join('. ') || null,
    };
  }

  async commitRow(data: any, ctx: any, { currentUser, importJobId }: any = {}) {
    const messages: string[] = [];

    let user: any = this.base.findExistingUser(data, ctx);
    if (user) {
      if (user.role !== ROLES.TEACHER) {
        throw new ApiError(
          400, `Bu telefon va ism ${user.role} rolidagi foydalanuvchiga tegishli`,
        );
      }
      messages.push("Mavjud o'qituvchi topildi");
    } else {
      user = await this.base.createUserWithUniqueLogin(
        (payload) =>
          this.auth.registerUser(
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
              userId: currentUser ? String(currentUser.id || currentUser._id) : null,
            },
          ),
        data,
      );
      messages.push(
        data.compensation ? 'Yaratildi (maosh stavkasi bilan)' : 'Yaratildi (maoshsiz)',
      );
    }

    if (data.openingBalance) {
      const res: any = await this.base.applyOpeningBalance(
        { user, role: ROLES.TEACHER, data, groupId: data.groupId },
        { currentUser, importJobId },
      );
      if (res?.status === 'duplicate') {
        messages.push("Boshlang'ich qoldiq allaqachon kiritilgan - qayta yozilmadi");
      } else {
        messages.push(
          data.openingBalance > 0
            ? `Qoldiq ${data.openingBalance.toLocaleString('ru-RU')} so'm - to'lanishi kerak`
            : `Avans ${Math.abs(data.openingBalance).toLocaleString('ru-RU')} so'm - keyingi oylikdan ushlanadi`,
        );
      }
    }

    return { status: ROW_STATUS.IMPORTED, message: messages.join('; ') };
  }
}
