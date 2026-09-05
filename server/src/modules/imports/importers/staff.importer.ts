import { Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../../common/errors/api-error.js';
import { ROLES, PERMISSIONS } from '../../../common/constants/permissions.js';
import { STAFF_SALARY_TYPES } from '../../../common/constants/staff-payroll.js';
import { UsersService } from '../../users/index.js';
import { StaffCompensationService } from '../../staff-payroll/index.js';
import { ROW_STATUS, type Importer } from '../import-engine.service.js';
import { asDate, asNumber, asEnum, isBlank } from '../coerce.js';
import {
  IDENTITY_COLUMNS, OPENING_COLUMN, NOTE_COLUMN, UserImportBaseService, norm,
} from './user-import-base.service.js';

const SALARY_TYPE_MAP: Record<string, string> = {
  fiksa: 'fixed', oylik: 'fixed', fixed: 'fixed',
  'fiksa+kpi': 'fixed_plus_kpi', 'fiksa + kpi': 'fixed_plus_kpi',
  fixed_plus_kpi: 'fixed_plus_kpi',
  kpi: 'kpi_only', kpi_only: 'kpi_only', 'faqat kpi': 'kpi_only',
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIM IMPORTI (direktor, administrator, resepshin va h.k.).
 *
 * O'QITUVCHIDAN FARQI: rol DINAMIK (`Role` jadvalidan, owner o'zi
 * yaratgan rollar ham) va maosh BOSHQA modelda (`StaffCompensation`).
 *
 * ── BOSHLANG'ICH QARZ QIRQILMAYDI ──
 * Xodimning qarzi oylik maoshidan katta bo'lsa, o'sha oy 0 to'lanadi va
 * QOLDIG'I KEYINGI OYGA ko'chiriladi. Jarima uchun bunday EMAS — u
 * qirqiladi. Farq ATAYLAB: jarima QARORI, qoldiq esa HAQIQIY PUL.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class StaffImporter implements Importer {
  private readonly logger = new Logger('StaffImporter');

  readonly key = 'staff';
  readonly label = 'Xodimlar';
  readonly fileBase = 'xodimlar-import';
  readonly sheetName = 'Xodimlar';
  /**
   * ⚠ IKKITA HUQUQ — `users.routes.js` dagi `/staff` yo'li bilan BIR XIL
   * mulohaza: bu amal odam YARATADI va ROL BIRIKTIRADI. Import o'sha
   * yo'lning ommaviy varianti bo'lgani uchun talab ham bir xil bo'lishi
   * SHART, aks holda import "YON ESHIK" bo'lib qolardi.
   */
  readonly permission = PERMISSIONS.TEACHERS_CREATE;
  readonly extraPermissions = [PERMISSIONS.ROLES_UPDATE];
  readonly gridEnabled = true;

  readonly columns = [
    ...IDENTITY_COLUMNS,
    {
      key: 'roleName', header: 'Rol', width: 18, required: true, primary: true,
      optionsKey: 'roles', example: 'administrator',
      note: "MAJBURIY. Ro'yxatdan tanlanadi.",
    },
    {
      key: 'hiredAt', header: 'Ishga olingan sana', width: 20, primary: true,
      example: '2026-05-05',
      note: "Bo'sh qoldirilsa bugungi sana.",
    },
    {
      key: 'salaryType', header: 'Maosh turi', width: 16, example: 'fiksa',
      note: "fiksa / fiksa+kpi / kpi. Bo'sh qoldirilsa maosh belgilanmaydi.",
    },
    {
      key: 'baseAmount', header: 'Oylik summa', width: 16, example: '3000000',
      note: 'fiksa va fiksa+kpi uchun majburiy.',
    },
    OPENING_COLUMN,
    NOTE_COLUMN,
  ];

  constructor(
    private readonly base: UserImportBaseService,
    private readonly users: UsersService,
    private readonly staffComp: StaffCompensationService,
  ) {}

  prepare(rawRows: any[], actor: any) {
    return this.base.prepareUserContext(rawRows, { role: 'staff', actor });
  }

  draftRow(raw: any, ctx: any) {
    return this.base.draftUserRow(raw, ctx, { role: 'staff' });
  }

  validateRow(raw: any, ctx: any) {
    const { errors, data } = this.base.validateUserRow(raw, ctx, { role: 'staff' });

    // ── Rol (MAJBURIY, DINAMIK) ──
    const roleName = norm(raw.roleName);
    if (!roleName) {
      errors.push({ field: 'roleName', message: 'Rol majburiy' });
    } else {
      const role = ctx.roleByValue.get(roleName);
      if (!role) {
        errors.push({
          field: 'roleName',
          message: `"${raw.roleName}" roli topilmadi. Avval rolni yarating`,
        });
      } else if (role.value === ROLES.STUDENT) {
        // ⚠ O'quvchi XODIM EMAS — u alohida importer bilan qo'shiladi
        // (u yerda guruh, ro'yxatga olingan sana va boshqa qoidalar bor).
        errors.push({
          field: 'roleName',
          message:
            'O\'quvchi roli bu importda ishlatilmaydi - "O\'quvchilar" importidan foydalaning',
        });
      } else {
        data.roleValue = role.value;
        data.roleLabel = role.label || role.value;
      }
    }

    // ── Ishga olingan sana ──
    if (!isBlank(raw.hiredAt)) {
      const hired = asDate(raw.hiredAt);
      if (!hired.ok) errors.push({ field: 'hiredAt', message: hired.error });
      else data.hiredAt = hired.value;
    }

    // ── Maosh ──
    if (!isBlank(raw.salaryType)) {
      const t = asEnum(raw.salaryType, SALARY_TYPE_MAP);
      if (!t.ok || !(STAFF_SALARY_TYPES as readonly string[]).includes(t.value as string)) {
        errors.push({
          field: 'salaryType', message: 'Maosh turi: fiksa / fiksa+kpi / kpi',
        });
      } else {
        let baseAmount = 0;
        if (t.value !== 'kpi_only') {
          const v = asNumber(raw.baseAmount, {
            min: 0, max: 1_000_000_000, integer: true,
          });
          if (!v.ok) errors.push({ field: 'baseAmount', message: 'Oylik summa kerak' });
          else baseAmount = v.value as number;
        }
        data.compensation = { salaryType: t.value, baseAmount };
      }
    } else if (data.openingBalance) {
      // ⚠ MUHIM OGOHLANTIRISH: shartnomasiz xodimda oylik hisobi
      // QURILMAYDI, ya'ni boshlang'ich QARZ hech qachon ushlab
      // qolinmaydi (ushlash uchun MAOSH kerak). Bu XATO emas — qarz
      // yozilaveradi va kartochkada ko'rinadi — lekin odam BILISHI kerak.
      data.openingWarning =
        "Maosh turi ko'rsatilmagan - qarz avtomatik ushlanmaydi, faqat qayd etiladi";
    }

    return { errors, data };
  }

  dedupeKey(data: any) {
    return data?.username ? `u:${data.username}` : null;
  }

  previewRow(data: any) {
    return {
      opening: data.openingBalance || 0,
      direction:
        (data.openingBalance || 0) > 0
          ? "Biz xodimga qarzmiz (oylikka qo'shiladi)"
          : (data.openingBalance || 0) < 0
            ? "Xodim bizga qarz (oylikdan ushlanadi, qoldig'i keyingi oyga ko'chadi)"
            : '',
      warning:
        [data.duplicateNameWarning, data.openingWarning].filter(Boolean).join('. ')
        || null,
    };
  }

  async commitRow(data: any, ctx: any, { currentUser, importJobId }: any = {}) {
    const messages: string[] = [];

    let user: any = this.base.findExistingUser(data, ctx);
    if (user) {
      if (user.role === ROLES.STUDENT) {
        throw new ApiError(400, "Bu telefon va ism o'quvchiga tegishli");
      }
      messages.push('Mavjud xodim topildi');
    } else {
      user = await this.base.createUserWithUniqueLogin(
        (payload) =>
          this.users.createStaff(
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

      // ── MAOSH SHARTNOMASI — ALOHIDA QADAM ──
      //
      // ⚠ `createStaff()` o'qituvchi uchun `compensation` ni qabul
      // qiladi, lekin u `TeacherCompensation` ga yozadi. Xodimniki
      // BOSHQA model (`StaffCompensation`), shuning uchun bu yerda
      // OCHIQ chaqiriladi.
      //
      // ⚠ BEST-EFFORT: stavkadagi xato XODIM YARATILISHINI bekor
      // QILMAYDI — u allaqachon bazada va uni o'chirish QAYTARIB
      // BO'LMAYDIGAN zarar bo'lardi.
      if (data.compensation) {
        try {
          await this.staffComp.setCompensation(
            {
              employee: String(user.id || user._id),
              branchId: data.branchId,
              salaryType: data.compensation.salaryType,
              baseAmount: data.compensation.baseAmount,
              effectiveFrom: data.hiredAt || undefined,
            } as never,
            currentUser,
          );
          messages.push('Maosh stavkasi belgilandi');
        } catch (err) {
          this.logger.warn(
            `Import: xodim maosh stavkasi belgilanmadi (${String(user.id || user._id)}): ` +
              `${(err as Error)?.message}`,
          );
          messages.push("DIQQAT: maosh stavkasi belgilanmadi - profildan kiriting");
        }
      }
    }

    if (data.openingBalance) {
      const res: any = await this.base.applyOpeningBalance(
        { user, role: 'staff', data, groupId: null },
        { currentUser, importJobId },
      );
      if (res?.status === 'duplicate') {
        messages.push("Boshlang'ich qoldiq allaqachon kiritilgan - qayta yozilmadi");
      } else {
        messages.push(
          data.openingBalance > 0
            ? `Qoldiq ${data.openingBalance.toLocaleString('ru-RU')} so'm - to'lanishi kerak`
            : `Avans ${Math.abs(data.openingBalance).toLocaleString('ru-RU')} so'm - oylikdan ushlanadi`,
        );
      }
    }

    return { status: ROW_STATUS.IMPORTED, message: messages.join('; ') };
  }
}
