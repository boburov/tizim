import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XABAR MATNI SHAXSIYLASHTIRISH — `services/personalizeBody.helper.js`
 * NING AYNAN KO'CHIRMASI.
 *
 * Frontend'dagi `MESSAGE_VARIABLES` bilan mos bo'lishi SHART: token
 * ro'yxati ikki tomonda ham bir xil, aks holda forma taklif qilgan
 * o'zgaruvchi matnda almashtirilmay, o'quvchiga "{ism}" ko'rinishida
 * yetib borardi.
 *
 * ⚠ `{qarz}` ATAYLAB BO'SH QOLDIRILADI — tizimda real to'lov ma'lumoti
 * yo'q. Uni "yaxshilab" qarzga ulash bu modul ishi EMAS.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const TOKENS = ['{ism}', '{familiya}', '{guruh}', '{qarz}', '{markaz}'];

/** Matnda almashtiriladigan token bormi (bo'lmasa — keraksiz DB so'rovi yo'q). */
export const hasTokens = (text: string | null | undefined = ''): boolean => {
  const s = String(text || '');
  return TOKENS.some((t) => s.includes(t));
};

const replaceAll = (text: string, token: string, value: string | undefined): string =>
  text.split(token).join(value ?? '');

interface TokenValues {
  firstName?: string;
  lastName?: string;
  groupName?: string;
}

@Injectable()
export class PersonalizeBodyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private applyValues(text: string, { firstName, lastName, groupName }: TokenValues): string {
    let out = String(text || '');
    out = replaceAll(out, '{ism}', firstName);
    out = replaceAll(out, '{familiya}', lastName);
    out = replaceAll(out, '{guruh}', groupName);
    out = replaceAll(out, '{qarz}', ''); // to'lov tizimi yo'q
    // Brend nomi `APP_NAME` env'idan — shablon bazada qolgani holda markaz
    // nomi o'zgarsa, xabar YUBORISH paytida yangi nom bilan chiqadi.
    out = replaceAll(out, '{markaz}', this.config.get<string>('APP_NAME') || 'Bayyina');
    return out;
  }

  /** Bitta foydalanuvchining faol guruh nomi (yo'q bo'lsa ""). */
  private async resolveGroupName(userId: string): Promise<string> {
    const membership = await this.prisma.groupMembership.findFirst({
      where: { studentId: String(userId), leftAt: null, isDeleted: false },
      orderBy: { joinedAt: 'desc' },
      include: { group: { select: { name: true } } },
    });
    return membership?.group?.name || '';
  }

  /**
   * BITTA foydalanuvchi, KO'P matn (in-app inbox).
   * Ism/familiya va guruh nomi BIR MARTA yechiladi va har bir matnga
   * qo'llanadi — inbox sahifasida 20 ta xabar uchun 20 ta so'rov emas.
   */
  async personalizeManyForUser(
    texts: string[],
    userId: string,
    recipientUser: { firstName?: string; lastName?: string } | null = null,
  ): Promise<string[]> {
    const anyToken = texts.some((t) => hasTokens(t));
    if (!anyToken) return texts;

    let user = recipientUser;
    if (!user || user.firstName === undefined) {
      user = await this.prisma.user.findUnique({
        where: { id: String(userId) },
        select: { firstName: true, lastName: true },
      });
    }

    const needsGroup = texts.some((t) => String(t).includes('{guruh}'));
    const groupName = needsGroup ? await this.resolveGroupName(userId) : '';

    const values: TokenValues = {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      groupName,
    };
    return texts.map((t) => (hasTokens(t) ? this.applyValues(t, values) : t));
  }

  /** Bitta foydalanuvchi, bitta matn — qulaylik o'ramasi. */
  async personalizeForUser(
    text: string,
    userId: string,
    recipientUser: { firstName?: string; lastName?: string } | null = null,
  ): Promise<string> {
    const [out] = await this.personalizeManyForUser([text], userId, recipientUser);
    return out;
  }

  /**
   * KO'P foydalanuvchi, BITTA matn (bot yetkazish).
   * N+1 YO'Q: foydalanuvchilar ham, guruh nomlari ham bittadan so'rovda.
   */
  async personalizeBulk(text: string, userIds: string[]): Promise<Map<string, string>> {
    const ids = userIds.map(String);
    if (!hasTokens(text)) {
      return new Map(ids.map((id) => [id, text]));
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userById = new Map(users.map((u) => [String(u.id), u]));

    const groupByUser = new Map<string, string>();
    if (String(text).includes('{guruh}')) {
      const memberships = await this.prisma.groupMembership.findMany({
        where: { studentId: { in: ids }, leftAt: null, isDeleted: false },
        orderBy: { joinedAt: 'desc' },
        select: { studentId: true, joinedAt: true, group: { select: { name: true } } },
      });
      for (const m of memberships) {
        const key = String(m.studentId);
        // `orderBy joinedAt:desc` → birinchi uchragan = eng so'nggi.
        if (!groupByUser.has(key)) groupByUser.set(key, m.group?.name || '');
      }
    }

    const result = new Map<string, string>();
    for (const id of ids) {
      const u = userById.get(id);
      result.set(
        id,
        this.applyValues(text, {
          firstName: u?.firstName || '',
          lastName: u?.lastName || '',
          groupName: groupByUser.get(id) || '',
        }),
      );
    }
    return result;
  }
}
