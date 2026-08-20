import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { ROLES } from '../../common/constants/permissions.js';
import { BOT_STATUS, botStatusOf } from '../../common/rbac/bot-status.js';
import { PermissionService } from '../../common/rbac/permission.service.js';

/**
 * `helpers/userProfile.helper.js` — `/auth/me` javobidagi `profile`.
 *
 * ⚠⚠ QISMAN KO'CHIRILGAN — VA BU ATAYLAB LOUD ⚠⚠
 *
 * O'QUVCHI va O'QITUVCHI profili ko'chirilmagan modullarga tayanadi:
 *
 *   o'quvchi  → groups.findAllActiveForStudent, findPendingRemovalNotice,
 *               attendance.getStudentSummary, studentFreeze.getActiveFreeze
 *   o'qituvchi → groups.list (+ shapeGroup)
 *
 * `getStudentSummary` o'z navbatida dars kunlari hisobi, bayramlar,
 * imtiyoz va muzlatish oynalarini tortadi — ya'ni butun `attendance`
 * yadrosi. Bu Faza 2.5/E ishi, 2.3 emas.
 *
 * SHUNING UCHUN: bu ikki rol uchun profil JIMGINA BO'SH QAYTARILMAYDI —
 * ochiq xato beriladi. Bo'sh qaytarish `/auth/me` shartnomasini buzib,
 * klientda "guruhlarim yo'q" degan YOLG'ON holat ko'rsatardi.
 *
 * Qolgan rollar (owner, direktor, resepshin, custom staff) uchun profil
 * TO'LIQ va Express bilan bir xil.
 */

const calcYears = (date: unknown): number | null => {
  if (!date) return null;
  const d = new Date(date as string);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let years = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) years -= 1;
  return years >= 0 ? years : null;
};

const sanitize = (user: Record<string, unknown>) => {
  const { passwordHash, ...rest } = user;
  return withLegacyId(rest);
};

@Injectable()
export class UserProfileService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  /**
   * Bog'lanish MA'LUMOTI (kim) va HOLATI (yetadimi) — ikki xil savol.
   * Ilgari faqat birinchisi qaytardi va profil "Telegram: @user" deb
   * turaverardi, xabar esa aslida yetmasdi.
   */
  private async fetchTelegram(userId: string) {
    const bot = await this.prisma.botUser.findFirst({ where: { userId } });
    if (!bot) return null;
    return {
      // `telegramId` BigInt — JSON.stringify uni seriyalay olmaydi va
      // javob 500 bilan yiqilardi. Klient uni raqam sifatida kutadi.
      telegramId: Number(bot.telegramId),
      username: bot.username,
      firstName: bot.firstName,
      lastName: bot.lastName,
      languageCode: bot.languageCode,
      isBlocked: !!bot.isBlocked,
      lastSeenAt: bot.lastSeenAt || null,
      status: botStatusOf(bot),
    };
  }

  async build(userInput: Record<string, unknown> | string) {
    let user = userInput as Record<string, unknown> | null;
    if (!user || typeof user !== 'object' || user.role === undefined) {
      user = (await this.prisma.user.findUnique({
        where: { id: String(userInput) },
      })) as Record<string, unknown> | null;
    }
    if (!user) return null;

    const base = sanitize(user) as Record<string, unknown>;

    // ROL YORLIG'I serverdan keladi: klientdagi qattiq ro'yxatda custom
    // rollar YO'Q va ular profilda "noma'lum rol" bo'lib chiqardi.
    const roleMeta = await this.permissions.resolveRole(String(user.role));
    base.roleLabel = roleMeta.label;
    base.roleType = roleMeta.roleType;
    base.roleIsFrozen = Boolean(roleMeta.isFrozen);

    const telegram = await this.fetchTelegram(String(user.id));
    const botStatus = telegram?.status || BOT_STATUS.NOT_LINKED;

    if (user.role === ROLES.STUDENT || user.role === ROLES.TEACHER) {
      throw new ApiError(
        501,
        "O'quvchi va o'qituvchi profili NestJS'ga hali ko'chirilmagan " +
          "(guruh/davomat/muzlatish modullari kerak). Express (5000-port) " +
          'to\'liq ishlaydi.',
        { code: 'PROFILE_NOT_MIGRATED', details: { role: user.role } },
      );
    }

    // Owner va boshqa rollar — minimal profil (Express bilan AYNAN bir xil).
    return { ...base, age: calcYears(user.birthDate), telegram, botStatus };
  }
}
