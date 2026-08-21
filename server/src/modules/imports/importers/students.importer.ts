import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ApiError } from '../../../common/errors/api-error.js';
import { ROLES, PERMISSIONS } from '../../../common/constants/permissions.js';
import { toUtcMidnight } from '../../../common/utils/date.js';
import { AuthService } from '../../auth/auth.service.js';
import { GroupsService } from '../../groups/groups.service.js';
import { ROW_STATUS, type Importer } from '../import-engine.service.js';
import { asDate, asEnum, isBlank } from '../coerce.js';
import {
  IDENTITY_COLUMNS, OPENING_COLUMN, NOTE_COLUMN, UserImportBaseService, norm,
} from './user-import-base.service.js';

const GENDER_MAP: Record<string, string> = {
  erkak: 'male', "o'g'il": 'male', ogil: 'male', male: 'male', m: 'male',
  ayol: 'female', qiz: 'female', female: 'female', f: 'female',
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI IMPORTI (jadval rejimi).
 *
 * ── ENG MUHIM MAYDON: "Guruhga qo'shilgan sana" ──
 * O'quvchi guruhga qo'shilganda tizim A'ZOLIK SANASIDAN BUGUNGACHA HAR
 * OY uchun proratsiyalangan to'lov qatorini AVTOMATIK quradi
 * (`ensureFinanceForMembershipRange`). Ya'ni bu sana bir oy ORQAGA
 * surilsa — BIR OYLIK QARZ qo'shiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class StudentsImporter implements Importer {
  private readonly logger = new Logger('StudentsImporter');

  readonly key = 'students';
  readonly label = "O'quvchilar";
  readonly fileBase = 'oquvchilar-import';
  readonly sheetName = "O'quvchilar";
  /**
   * ⚠ Boshlang'ich QOLDIQ yozilgan qatorlar uchun bundan TASHQARI
   * `finance.manage` ham tekshiriladi (`validateUserRow`) — o'quvchi
   * qo'sha oladigan resepshin avtomatik ravishda PUL yozish huquqini
   * OLMASLIGI kerak.
   */
  readonly permission = PERMISSIONS.STUDENTS_CREATE;
  readonly gridEnabled = true;

  readonly columns = [
    ...IDENTITY_COLUMNS,
    {
      key: 'gender', header: 'Jins', width: 12, example: 'erkak',
      note: 'Ixtiyoriy: erkak / ayol',
    },
    {
      key: 'enrolledAt', header: "Ro'yxatga olingan sana", width: 22,
      example: '2026-05-05',
      note:
        "MAJBURIY. Kelajakda bo'lmasin. Bo'sh qoldirilsa guruh boshlanish " +
        'sanasi qo\'yiladi.',
    },
    {
      key: 'groupName', header: 'Guruh', width: 22, primary: true,
      optionsKey: 'groups', example: 'IELTS-A1',
      note:
        "Ro'yxatdan tanlanadi. Yangi guruh AVTOMATIK YARATILMAYDI. " +
        "Boshlang'ich qarz (-) kiritilsa guruh MAJBURIY.",
    },
    {
      key: 'joinedAt', header: "Guruhga qo'shilgan sana", width: 24,
      example: '2026-05-05',
      note:
        "DIQQAT: shu sanadan bugungacha HAR OY uchun to'lov qatori " +
        "yaratiladi. Bo'sh qoldirilsa guruh boshlanish sanasi olinadi. " +
        "Guruh boshlanishidan oldin bo'lishi mumkin emas.",
    },
    OPENING_COLUMN,
    NOTE_COLUMN,
  ];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly base: UserImportBaseService,
    private readonly auth: AuthService,
    private readonly groups: GroupsService,
  ) {}

  async prepare(rawRows: any[], actor: any) {
    const ctx = await this.base.prepareUserContext(rawRows, {
      role: ROLES.STUDENT, actor,
    });

    // Preview uchun: guruh id → guruh, guruh id → oylik tarif.
    ctx.groupById = new Map<string, any>();
    for (const g of ctx.groupByName.values()) ctx.groupById.set(String(g._id), g);
    ctx.feeByGroup = await this.base.loadGroupFees([...ctx.groupById.keys()]);

    return ctx;
  }

  draftRow(raw: any, ctx: any) {
    return this.base.draftUserRow(raw, ctx, { role: ROLES.STUDENT });
  }

  validateRow(raw: any, ctx: any) {
    const { errors, data } = this.base.validateUserRow(raw, ctx, {
      role: ROLES.STUDENT,
    });

    // ── Jins ──
    if (!isBlank(raw.gender)) {
      const g = asEnum(raw.gender, GENDER_MAP);
      if (!g.ok) errors.push({ field: 'gender', message: 'Jins: erkak yoki ayol' });
      else data.gender = g.value;
    }

    // ── Ro'yxatga olingan sana (MAJBURIY) ──
    const enrolled = asDate(raw.enrolledAt);
    if (!enrolled.ok) errors.push({ field: 'enrolledAt', message: enrolled.error });
    else data.enrolledAt = enrolled.value;

    // ── Guruh ──
    const groupName = norm(raw.groupName);
    let group: any = null;
    if (groupName) {
      group = ctx.groupByName.get(groupName);
      if (!group) {
        // ⚠ AVTOMATIK YARATMAYMIZ — ATAYLAB. Bitta xato harf
        // ("IELTS Beginer") JIMGINA yangi guruh tug'dirardi va o'quvchi
        // YOLG'IZ o'zi o'sha guruhda qolardi.
        errors.push({
          field: 'groupName',
          message:
            `"${raw.groupName}" guruhi topilmadi. Nomni tekshiring yoki avval guruhni yarating`,
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
        if (!j.ok) errors.push({ field: 'joinedAt', message: j.error });
        else if (groupStart && (j.value as Date).getTime() < groupStart.getTime()) {
          errors.push({
            field: 'joinedAt',
            message:
              `Guruh ${groupStart.toISOString().slice(0, 10)} da boshlangan - undan oldin qo'shib bo'lmaydi`,
          });
        } else {
          data.joinedAt = j.value;
        }
      } else {
        data.joinedAt = groupStart;
      }

      // ⚠ A'ZOLIK SANASI RO'YXATGA OLINGAN SANADAN OLDIN BO'LMASIN.
      //
      // Bu qoida `addStudent()` ichida ham bor va u YOZISH paytida xato
      // beradi. Lekin o'shanda foydalanuvchi ALLAQACHON yaratilgan
      // bo'ladi — qator "yarim bajarilgan" holatda qolardi (odam bor,
      // guruhi yo'q). Shuning uchun bu yerda, YOZISHDAN OLDIN ushlaymiz.
      if (
        data.joinedAt && data.enrolledAt &&
        data.joinedAt.getTime() < data.enrolledAt.getTime()
      ) {
        errors.push({
          field: 'enrolledAt',
          message:
            "Ro'yxatga olingan sana guruhga qo'shilgan sanadan keyin turibdi - " +
            `uni ${data.joinedAt.toISOString().slice(0, 10)} yoki undan oldingi kunga o'zgartiring`,
        });
      }
    }

    // ── Boshlang'ich QARZ guruhsiz: XATO EMAS, KUTISH ──
    //
    // `StudentPayment` guruhsiz bo'lolmaydi, shuning uchun qarz darhol
    // qator bo'lib yozilmaydi. Lekin u YO'QOLMAYDI: yozuv "guruh
    // kutmoqda" holatida saqlanadi va o'quvchi birinchi guruhga
    // qo'shilganda AVTOMATIK yoziladi (`materializePendingForStudent`).
    if ((data.openingBalance || 0) < 0 && !data.groupId) {
      data.openingWarning = [
        data.openingWarning,
        "Guruh tanlanmagan - qarz guruhga qo'shilgunga qadar kutib turadi",
      ].filter(Boolean).join('. ');
    }

    return { errors, data };
  }

  /** Fayl ichidagi takror: login HAR DOIM yagona bo'lishi kerak. */
  dedupeKey(data: any) {
    return data?.username ? `u:${data.username}` : null;
  }

  previewRow(data: any, ctx: any) {
    return this.base.previewStudentRow(data, ctx);
  }

  /**
   * QATORNI YOZADI. ⚠ TARTIB QAT'IY:
   *   1) foydalanuvchi,
   *   2) guruhga qo'shish  → O'TGAN OYLAR to'lovi shu yerda yaratiladi,
   *   3) boshlang'ich qoldiq → depozit AVANSI o'sha qarzlarni yopadi.
   * 2 va 3 o'rin almashsa avans yopadigan qarz HALI MAVJUD BO'LMAS EDI.
   */
  async commitRow(data: any, ctx: any, { currentUser, importJobId }: any = {}) {
    const messages: string[] = [];

    // ── 1) FOYDALANUVCHI ──
    let user: any = this.base.findExistingUser(data, ctx);
    let created = false;

    if (user) {
      if (user.role !== ROLES.STUDENT) {
        throw new ApiError(
          400, `Bu telefon va ism ${user.role} rolidagi foydalanuvchiga tegishli`,
        );
      }
      messages.push("Mavjud o'quvchi topildi");
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
              role: ROLES.STUDENT,
              gender: payload.gender || null,
              birthDate: payload.birthDate || null,
              enrolledAt: payload.enrolledAt,
              homeBranchId: payload.branchId,
            },
            {
              allowedBranchIds: ctx.allowedBranchIds,
              canSeeAllBranches: ctx.canSeeAll,
              userId: currentUser ? String(currentUser.id || currentUser._id) : null,
            },
          ),
        data,
      );
      created = true;
    }

    // ── 2) GURUHGA QO'SHISH ──
    // ⚠ Bu chaqiruv A'ZOLIK SANASIDAN BUGUNGACHA har oy uchun to'lov
    // qatorini quradi.
    if (data.groupId) {
      const already = await this.prisma.groupMembership.findFirst({
        where: {
          groupId: String(data.groupId),
          studentId: String(user.id || user._id),
          leftAt: null,
          isDeleted: false,
        },
      });

      if (already) {
        messages.push("Allaqachon shu guruhda");
      } else {
        await this.groups.addStudent(data.groupId, String(user.id || user._id), {
          joinedAt: data.joinedAt,
        });
        messages.push(`"${data.groupName}" guruhiga qo'shildi`);
      }
    }

    // ── 3) BOSHLANG'ICH QOLDIQ ──
    if (data.openingBalance) {
      const res: any = await this.base.applyOpeningBalance(
        {
          user, role: ROLES.STUDENT, data,
          groupId: data.groupId, joinedAt: data.joinedAt,
        },
        { currentUser, importJobId },
      );
      if (res?.status === 'duplicate') {
        messages.push("Boshlang'ich qoldiq allaqachon kiritilgan - qayta yozilmadi");
      } else if (data.openingBalance > 0) {
        messages.push(
          `Avans ${data.openingBalance.toLocaleString('ru-RU')} so'm - eski qarzlarga taqsimlandi`,
        );
      } else {
        messages.push(
          `Boshlang'ich qarz ${Math.abs(data.openingBalance).toLocaleString('ru-RU')} so'm`,
        );
      }
    }

    if (!created && !data.groupId && !data.openingBalance) {
      this.logger.log(
        `Import qatori hech narsa o'zgartirmadi (mavjud o'quvchi, guruh va qoldiq yo'q): ` +
          `${String(user.id || user._id)}`,
      );
    }

    return { status: ROW_STATUS.IMPORTED, message: messages.join('; ') };
  }
}
