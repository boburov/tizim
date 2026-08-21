import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ROLES, PERMISSIONS } from '../../../common/constants/permissions.js';
import { hasPermission } from '../../../common/rbac/permission.service.js';
import { normalizePhone } from '../../../common/utils/phone.js';
import {
  baseUsername, generatePassword, nextUsernameCandidate,
} from '../../../common/utils/credentials.js';
import { toUtcMidnight, localTodayMidnight } from '../../../common/utils/date.js';
import {
  getActiveBranchId, getAllowedBranchIds, canSeeAllBranches,
  branchFilter, userBranchCondition,
} from '../../../common/als/branch-context.js';
import {
  OPENING_MAX_AMOUNT, OPENING_WARN_AMOUNT,
} from '../../../common/constants/opening-balance.js';
import { OpeningBalanceService } from '../../opening-balance/opening-balance.service.js';
import { asText, asNumber, asDate, isBlank } from '../coerce.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ODAM IMPORTLARINING UMUMIY QISMI (`registry/userImportBase.js`).
 *
 * O'quvchi, o'qituvchi va xodim importlari BIR XIL shaxsiy maydonlarga
 * ega (ism, login, parol, telefon, filial, boshlang'ich qoldiq) —
 * ularning tekshiruvi SHU YERDA, bir joyda.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();
export const isoDay = (d: unknown) =>
  (d ? new Date(d as never).toISOString().slice(0, 10) : '');

const pushErr = (errors: any[], field: string, message: string) =>
  errors.push({ field, message });

// ─────────────────────────── USTUNLAR ───────────────────────────

const col = (key: string, header: string, extra: any = {}) =>
  ({ key, header, width: 18, ...extra });

export const IDENTITY_COLUMNS = [
  col('firstName', 'Ism', {
    width: 16, required: true, primary: true, slot: 'name',
    example: 'Ali', note: 'Majburiy.',
  }),
  col('lastName', 'Familiya', {
    width: 18, required: true, primary: true, slot: 'name',
    example: 'Valiyev', note: 'Majburiy.',
  }),
  col('phone', 'Telefon', {
    width: 16, primary: true, example: '998901234567',
    note:
      "Ixtiyoriy. Takrorlanishi MUMKIN - bitta raqamdan aka-uka yoki " +
      'ona-farzand foydalanishi odatiy hol.',
  }),
  col('username', 'Login', {
    width: 20, primary: true, slot: 'sub', example: 'ali.valiyev',
    note: "Bo'sh qoldiring - tizim ism-familyadan avtomatik yasaydi. Tahrirlash mumkin.",
  }),
  col('password', 'Parol', {
    width: 14, primary: true, example: 'kfa2846',
    note: "Bo'sh qoldiring - tizim avtomatik yasaydi. Kamida 6 belgi.",
  }),
  col('birthDate', "Tug'ilgan sana", {
    width: 16, example: '2005-04-12',
    note: 'Ixtiyoriy. Format: 2005-04-12 yoki 12.04.2005',
  }),
  col('branchName', 'Filial', {
    width: 18, optionsKey: 'branches', example: 'Asosiy filial',
    note: "Bo'sh qoldirilsa joriy tanlangan filial ishlatiladi.",
  }),
];

export const OPENING_COLUMN = col('openingBalance', "Boshlang'ich summa", {
  width: 22, primary: true, example: '+300000',
  note:
    'Ixtiyoriy. ISHORA MUHIM va BARCHA rollar uchun BIR XIL: ' +
    '(+) markaz shu odamga qarzdor, (-) odam markazga qarzdor. ' +
    "Masalan o'quvchi -300000 = u markazga 300 000 qarz; +300000 = avans. " +
    "O'qituvchi/xodim +300000 = markaz unga 300 000 qarzdor (to'lanadi); " +
    '-300000 = u markazga qarz (oylikdan ushlanadi).',
});

export const NOTE_COLUMN = col('note', 'Izoh', {
  width: 24, note: "Ixtiyoriy. Boshlang'ich qoldiq yozuviga biriktiriladi.",
});

@Injectable()
export class UserImportBaseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly openingBalances: OpeningBalanceService,
  ) {}

  /**
   * OMMAVIY QIDIRUVLAR — har qator uchun DB'ga bormaslik uchun BIR MARTA.
   */
  async prepareUserContext(
    rawRows: any[], { role, actor = {} }: { role: string; actor?: any },
  ) {
    const groupNames = [
      ...new Set(rawRows.map((r) => norm(r.groupName)).filter(Boolean)),
    ];
    const phones = [
      ...new Set(rawRows.map((r) => normalizePhone(r.phone)).filter(Boolean)),
    ];
    const usernames = [
      ...new Set(rawRows.map((r) => norm(r.username)).filter(Boolean)),
    ];

    const branchCond = userBranchCondition();

    const [groups, branches, byPhone, byUsername, roles] = await Promise.all([
      groupNames.length
        ? this.prisma.group.findMany({
            where: { isDeleted: false, ...branchFilter() },
            select: {
              id: true, name: true, startDate: true, createdAt: true,
              branchId: true, isActive: true, endDate: true,
            },
          })
        : [],
      this.prisma.branch.findMany({
        where: { isDeleted: false },
        select: { id: true, name: true, isActive: true },
      }),
      phones.length
        ? this.prisma.user.findMany({
            where: {
              phone: { in: phones as string[] },
              isDeleted: false,
              ...(branchCond ? { AND: [branchCond] } : {}),
            } as never,
            select: {
              id: true, phone: true, firstName: true, lastName: true,
              role: true, username: true,
            },
          })
        : [],
      usernames.length
        ? this.prisma.user.findMany({
            where: { username: { in: usernames } },
            select: { username: true },
          })
        : [],
      role === 'staff'
        ? this.prisma.role.findMany({ select: { value: true, label: true } })
        : [],
    ]);

    const groupByName = new Map<string, any>();
    for (const g of groups) {
      (g as any)._id = g.id; // moslik
      groupByName.set(norm(g.name), g);
    }

    const branchByName = new Map<string, any>();
    for (const b of branches) {
      (b as any)._id = b.id; // moslik
      branchByName.set(norm(b.name), b);
    }

    const usersByPhone = new Map<string, any[]>();
    for (const u of byPhone) {
      const list = usersByPhone.get(u.phone as string) || [];
      list.push(u);
      usersByPhone.set(u.phone as string, list);
    }

    const nameConditions = rawRows
      .filter((r) => norm(r.firstName) && norm(r.lastName))
      .map((r) => ({
        firstName: { equals: String(r.firstName).trim(), mode: 'insensitive' },
        lastName: { equals: String(r.lastName).trim(), mode: 'insensitive' },
      }))
      .slice(0, 200);

    const nameFilter = (extra: any = {}) => {
      const base = { isDeleted: false, ...extra };
      // ⚠ Bo'sh `OR` Prisma'da BARCHA qatorni qaytarardi — shuning uchun
      // ochiq "hech narsa" filtri.
      if (!nameConditions.length) return { ...base, id: { in: [] } };
      if (branchCond) return { ...base, AND: [{ OR: nameConditions }, branchCond] };
      return { ...base, OR: nameConditions };
    };

    const sameName = nameConditions.length
      ? await this.prisma.user.findMany({
          where: nameFilter() as never,
          select: { firstName: true, lastName: true, username: true, phone: true },
        })
      : [];

    const usersByName = new Map<string, number>();
    for (const u of sameName) {
      const k = `${norm(u.firstName)}|${norm(u.lastName)}`;
      usersByName.set(k, (usersByName.get(k) || 0) + 1);
    }

    const roleByValue = new Map<string, any>();
    for (const r of roles) {
      roleByValue.set(norm(r.value), r);
      if (r.label) roleByValue.set(norm(r.label), r);
    }

    return {
      role,
      groupByName,
      branchByName,
      usersByPhone,
      usersByName,
      roleByValue,
      dbUsernames: new Set(byUsername.map((u) => u.username)),
      canWriteOpening: hasPermission(actor.permissions, PERMISSIONS.FINANCE_MANAGE),
      takenUsernames: new Set(byUsername.map((u) => u.username)),
      activeBranchId: getActiveBranchId(),
      allowedBranchIds: getAllowedBranchIds(),
      canSeeAll: canSeeAllBranches(),
      defaultBranch:
        branches.find((b) => String(b.id) === String(getActiveBranchId())) || null,
    } as any;
  }

  /** AVTOTO'LDIRISH: login, parol, filial, sana. */
  draftUserRow(raw: any, ctx: any, { role }: { role: string }) {
    const out = { ...raw };

    if (isBlank(out.username)) {
      const base = baseUsername(out.firstName, out.lastName);
      let candidate = base;
      let i = 2;
      while (ctx.takenUsernames.has(candidate)) {
        candidate = `${base}${i}`;
        i += 1;
      }
      out.username = candidate;
    }
    ctx.takenUsernames.add(norm(out.username));

    if (isBlank(out.password)) out.password = generatePassword();

    if (isBlank(out.branchName) && ctx.defaultBranch) {
      out.branchName = ctx.defaultBranch.name;
    }

    if (!isBlank(out.groupName) && !ctx.groupByName.has(norm(out.groupName))) {
      out.groupName = '';
    }

    if (role === ROLES.STUDENT) {
      const group = ctx.groupByName.get(norm(out.groupName));
      const start = group ? toUtcMidnight(group.startDate || group.createdAt) : null;
      if (isBlank(out.joinedAt) && start) out.joinedAt = isoDay(start);
      if (isBlank(out.enrolledAt)) {
        out.enrolledAt = isoDay(start || localTodayMidnight());
      }
    }

    if (role === ROLES.TEACHER && isBlank(out.hiredAt)) {
      out.hiredAt = isoDay(localTodayMidnight());
    }
    if (role === 'staff' && isBlank(out.hiredAt)) {
      out.hiredAt = isoDay(localTodayMidnight());
    }

    return out;
  }

  validateUserRow(raw: any, ctx: any, { role }: { role: string }) {
    const errors: any[] = [];
    const data: any = { role };

    const first = asText(raw.firstName, { max: 60 });
    if (!first.ok || !first.value) pushErr(errors, 'firstName', 'Ism majburiy');
    else data.firstName = first.value;

    const last = asText(raw.lastName, { max: 60 });
    if (!last.ok || !last.value) pushErr(errors, 'lastName', 'Familiya majburiy');
    else data.lastName = last.value;

    const username = norm(raw.username);
    if (!username) pushErr(errors, 'username', 'Login majburiy');
    else if (username.length < 3) pushErr(errors, 'username', 'Login kamida 3 belgi');
    else if (username.length > 40) {
      pushErr(errors, 'username', "Login 40 belgidan oshmasin");
    } else if (!/^[a-z0-9._-]+$/.test(username)) {
      pushErr(
        errors, 'username',
        "Loginda faqat lotin harflari, raqam, nuqta va chiziqcha bo'lsin",
      );
    } else data.username = username;

    const password = String(raw.password ?? '').trim();
    if (!password) pushErr(errors, 'password', 'Parol majburiy');
    else if (password.length < 6) {
      pushErr(errors, 'password', 'Parol kamida 6 belgi');
    } else data.password = password;

    if (!isBlank(raw.phone)) {
      const phone = normalizePhone(raw.phone);
      if (!phone) {
        pushErr(errors, 'phone', "Telefon noto'g'ri (masalan 998901234567)");
      } else data.phone = phone;
    }

    if (!isBlank(raw.birthDate)) {
      const bd = asDate(raw.birthDate);
      if (!bd.ok) pushErr(errors, 'birthDate', bd.error!);
      else data.birthDate = bd.value;
    }

    const branchName = norm(raw.branchName);
    const branch = branchName ? ctx.branchByName.get(branchName) : ctx.defaultBranch;
    if (!branch) {
      pushErr(
        errors, 'branchName',
        branchName ? `"${raw.branchName}" filiali topilmadi` : 'Filial tanlanmagan',
      );
    } else if (!ctx.canSeeAll && !ctx.allowedBranchIds.includes(String(branch._id))) {
      pushErr(errors, 'branchName', "Bu filialga odam qo'shishga ruxsatingiz yo'q");
    } else {
      data.branchId = String(branch._id);
      data.branchName = branch.name;
    }

    if (!isBlank(raw.openingBalance)) {
      const signed = String(raw.openingBalance).trim().replace(/^\+\s*/, '');
      const amt = asNumber(signed, { integer: true });
      if (!amt.ok) {
        pushErr(errors, 'openingBalance', amt.error!);
      } else if (amt.value === 0) {
        data.openingBalance = 0;
      } else if (Math.abs(amt.value as number) > OPENING_MAX_AMOUNT) {
        pushErr(
          errors, 'openingBalance',
          `Summa ${OPENING_MAX_AMOUNT.toLocaleString('ru-RU')} so'mdan oshmasin`,
        );
      } else if (!ctx.canWriteOpening) {
        // ⚠ IMPORT "YON ESHIK" BO'LMASIN: o'quvchi qo'sha oladigan
        // resepshin avtomatik ravishda PUL YOZISH huquqini olmaydi.
        pushErr(
          errors, 'openingBalance',
          "Boshlang'ich qoldiq yozish uchun moliya huquqi (finance.manage) kerak",
        );
      } else {
        data.openingBalance = amt.value;
        if (Math.abs(amt.value as number) >= OPENING_WARN_AMOUNT) {
          data.openingWarning =
            `Summa juda katta (${(amt.value as number).toLocaleString('ru-RU')}) - tekshiring`;
        }
      }
    } else {
      data.openingBalance = 0;
    }

    const note = asText(raw.note, { max: 500 });
    data.note = note.ok ? note.value : '';

    const existing = this.findExistingUser(data, ctx);
    if (!existing && data.username && ctx.dbUsernames?.has(data.username)) {
      pushErr(
        errors, 'username',
        'Bu login band. Shu odam allaqachon yaratilgan bo\'lishi mumkin - ' +
          "telefon raqamini qo'shing yoki boshqa login kiriting",
      );
    }

    if (!existing && data.firstName && data.lastName) {
      const count = ctx.usersByName?.get(
        `${norm(data.firstName)}|${norm(data.lastName)}`,
      );
      if (count) {
        data.duplicateNameWarning =
          `Shu ism-familyali ${count} ta odam allaqachon bor - tekshiring`;
      }
    }

    return { errors, data };
  }

  /**
   * MAVJUD ODAMNI TOPADI — faqat TELEFON + ISM + FAMILIYA bo'yicha.
   *
   * ⚠ Faqat telefon YETARLI EMAS: bitta raqamdan aka-uka yoki ona-farzand
   * foydalanishi ODATIY hol.
   */
  findExistingUser(data: any, ctx: any) {
    if (!data.phone) return null;
    const list = ctx.usersByPhone.get(data.phone) || [];
    return (
      list.find(
        (u: any) =>
          norm(u.firstName) === norm(data.firstName) &&
          norm(u.lastName) === norm(data.lastName),
      ) || null
    );
  }

  /**
   * Login BAND bo'lsa keyingi variant bilan qayta uriniladi.
   *
   * ⚠ Bu YAKUNIY kafolat: `draftRow` dagi `taken` to'plami faqat TAKLIF
   * beradi, ikki foydalanuvchi bir vaqtda import qilsa login band bo'lib
   * qolishi mumkin.
   */
  async createUserWithUniqueLogin(
    createFn: (d: any) => Promise<any>, data: any,
  ): Promise<any> {
    let username = data.username;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await createFn({ ...data, username });
      } catch (err: any) {
        const isLoginClash =
          err?.code === 'P2002' && err.meta?.target?.includes('username');
        const isLoginMessage = err?.statusCode === 409;
        if (!isLoginClash && !isLoginMessage) throw err;
        username = nextUsernameCandidate(username, attempt);
      }
    }
    throw new Error("Bo'sh login topilmadi - loginni qo'lda o'zgartiring");
  }

  async applyOpeningBalance(
    { user, role, data, groupId, joinedAt }: any,
    { currentUser, importJobId }: any,
  ) {
    if (!data.openingBalance) return null;

    return this.openingBalances.create(
      {
        user: String(user.id || user._id),
        role,
        amount: data.openingBalance,
        group: groupId || null,
        branchId: data.branchId || null,
        joinedAt: joinedAt || null,
        note: data.note || '',
      },
      { currentUser, importJob: importJobId },
    );
  }

  /**
   * O'QUVCHI QATORI KO'RINISHI — "necha oy, qancha hisob, yakuniy balans".
   *
   * ⚠ `approximate: true`: bu TAXMIN (oxirgi tarif × oylar), haqiqiy
   * summa proratsiya bilan hisoblanadi. Foydalanuvchi kattalik tartibini
   * ko'rishi yetarli.
   */
  async previewStudentRow(data: any, ctx: any) {
    const warn = [data?.duplicateNameWarning, data?.openingWarning]
      .filter(Boolean).join('. ');

    if (!data?.groupId) {
      return {
        months: 0,
        billed: 0,
        opening: data?.openingBalance || 0,
        finalBalance: data?.openingBalance || 0,
        note: [warn, "Guruh tanlanmagan - oylik to'lov yaratilmaydi"]
          .filter(Boolean).join('. '),
      };
    }

    const group = ctx.groupById?.get(String(data.groupId));
    const start = data.joinedAt
      ? toUtcMidnight(data.joinedAt)
      : toUtcMidnight(group?.startDate || group?.createdAt);
    if (!start) return { months: 0, billed: 0, opening: data.openingBalance || 0 };

    const today = localTodayMidnight();
    const months =
      (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (today.getUTCMonth() - start.getUTCMonth()) + 1;

    const fee = ctx.feeByGroup?.get(String(data.groupId)) || 0;
    const billed = fee * Math.max(0, months);
    const opening = data.openingBalance || 0;

    return {
      months: Math.max(0, months),
      monthlyFee: fee,
      billed,
      opening,
      finalBalance: opening - billed,
      approximate: true,
      note: warn || null,
    };
  }

  /**
   * Guruhlarning ENG SO'NGGI oylik tarifi.
   *
   * ⚠ `isDeleted` FILTRI YO'Q — `GroupFee` da bunday ustun UMUMAN YO'Q.
   * Express'da bu Mongo davridan qolgan qoldiq edi va Prisma uni
   * "Unknown argument" bilan RAD ETARDI, ya'ni `loadGroupFees` HAR
   * chaqiruvda YIQILARDI. Guruh narxi hech qachon o'chirilmaydi — u
   * faqat `upsert` bilan yangilanadi.
   */
  async loadGroupFees(groupIds: string[]) {
    if (!groupIds?.length) return new Map<string, number>();
    const rows = await this.prisma.groupFee.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, amount: true, year: true, month: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const map = new Map<string, number>();
    for (const r of rows) {
      const k = String(r.groupId);
      if (!map.has(k)) map.set(k, Number(r.amount) || 0);
    }
    return map;
  }
}
