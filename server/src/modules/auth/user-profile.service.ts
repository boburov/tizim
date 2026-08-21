import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { ROLES } from '../../common/constants/permissions.js';
import { BOT_STATUS, botStatusOf } from '../../common/rbac/bot-status.js';
import { PermissionService } from '../../common/rbac/permission.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { StudentFreezeService } from '../student-freeze/student-freeze.service.js';

/**
 * `helpers/userProfile.helper.js` — `/auth/me` javobidagi `profile`.
 *
 * ⚠⚠ QISMAN KO'CHIRILGAN — VA BU ATAYLAB LOUD ⚠⚠
 *
 * ── HOLAT ──
 *
 *   owner / direktor / resepshin / custom staff → ✅ TO'LIQ
 *   o'qituvchi                                   → ✅ TO'LIQ (`groups` ko'chgach ochildi)
 *   o'quvchi                                     → ✅ ochiq (moliya zanjiri ko'chirilgach)
 *
 * ── NEGA O'QUVCHI HAMON YOPIQ ──
 *
 * O'quvchi profili TO'RT manbaga tayanadi:
 *
 *   groups.findAllActiveForStudent    ✅ ko'chirilgan
 *   groups.findPendingRemovalNotice   ✅ ko'chirilgan
 *   studentFreeze.getActiveFreeze     ✅ ko'chirilgan (`student-freeze`)
 *   attendance.getStudentSummary      🛑 `attendance` moduli YO'Q
 *
 * `getStudentSummary` o'z navbatida dars kunlari hisobi, bayramlar,
 * imtiyoz va muzlatish oynalarini tortadi — ya'ni butun `attendance`
 * yadrosi. UCHTA manba tayyor bo'lsa ham, TO'RTINCHISIZ javob
 * `attendanceSummary` maydonisiz chiqardi.
 *
 * ⚠ SHUNING UCHUN JIMGINA BO'SH QAYTARILMAYDI — ilgari ochiq 501
 * berilardi; endi barcha shoxlar ochiq.
 * Bo'sh yoki chala qaytarish `/auth/me` shartnomasini buzib, klientda
 * "davomatim yo'q" degan YOLG'ON holat ko'rsatardi. `attendance`
 * ko'chgan kuni shu bitta `throw` o'chiriladi va qolgan uchta chaqiruv
 * shu yerga qo'shiladi.
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
    private readonly groups: GroupsService,
    private readonly attendance: AttendanceService,
    private readonly freezes: StudentFreezeService,
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

    if (user.role === ROLES.STUDENT) {
      // ═══════════════════════════════════════════════════════════════
      // ✅ O'QUVCHI SHOXI OCHILDI (ilgari 501 `PROFILE_NOT_MIGRATED`).
      //
      // To'rtta manba KERAK edi va endi TO'RTALASI HAM ko'chirilgan:
      //   groups.findAllActiveForStudent    ✅
      //   groups.findPendingRemovalNotice   ✅
      //   attendance.getStudentSummary      ✅ (oxirgi bo'lib ko'chdi)
      //   studentFreeze.getActiveFreeze     ✅
      //
      // ⚠ Express bu yerda DINAMIK `import()` ishlatadi ("circular
      // dependency oldini olish"); NestJS'da modul grafi buni o'zi hal
      // qiladi — `AttendanceModule` `AuthModule` ni import QILMAYDI,
      // ya'ni aylana yo'q.
      // ═══════════════════════════════════════════════════════════════
      const activeGroups = await this.groups.findAllActiveForStudent(String(user.id));

      // Guruhdan chiqarilgan bo'lsa — login qilganda BIR MARTA modal.
      const removalNotice = await this.groups.findPendingRemovalNotice(String(user.id));

      // ⚠ ORALIQ AYNAN EXPRESS'DAGIDEK: joriy oyning birinchi kunidan
      // oxirgi kunining 23:59:59.999 gacha. Chegarani "soddalashtirish"
      // oxirgi kundagi davomatni tushirib qoldirardi.
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const monthEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
      );
      const attendanceSummary = await this.attendance.getStudentSummary(
        String(user.id), { fromDate: monthStart, toDate: monthEnd },
      );

      const activeFreeze = await this.freezes.getActiveFreeze(String(user.id));

      return {
        ...base,
        activeGroups,
        attendanceSummary,
        removalNotice,
        isFrozen: !!activeFreeze,
        activeFreeze: activeFreeze || null,
        telegram,
        botStatus,
      };
    }

    if (user.role === ROLES.TEACHER) {
      // ⚠ `limit: 100` — Express'dagi bilan AYNAN bir xil. Uni oshirish
      // "yaxshilash" emas, SHARTNOMANI o'zgartirish bo'lardi: 100 dan
      // ortiq guruhi bor o'qituvchi ikkala stekda ham bir xil kesilishi
      // kerak, aks holda paritet aynan chekka holatda buzilardi.
      const { items } = await this.groups.list({
        teacherId: String(user.id),
        page: 1,
        limit: 100,
      });
      // ⚠ FAQAT TO'RT MAYDON. `groups.list` guruh kartochkasi uchun
      // ancha ko'p narsa qaytaradi (o'qituvchilar ro'yxati, oylik tarif,
      // filial). Ularni profilga o'tkazib yuborish shartnomani
      // KENGAYTIRARDI — va `monthlyFee` orqali o'qituvchiga guruh
      // daromadini ochib qo'yardi.
      const groups = (items as Record<string, unknown>[]).map((g) => ({
        _id: g._id,
        name: g.name,
        schedule: g.schedule,
        studentsCount: g.studentsCount || 0,
      }));

      return {
        ...base,
        age: calcYears(user.birthDate),
        years: calcYears(user.hiredAt),
        groups,
        telegram,
        botStatus,
      };
    }

    // Owner va boshqa rollar — minimal profil (Express bilan AYNAN bir xil).
    return { ...base, age: calcYears(user.birthDate), telegram, botStatus };
  }
}
