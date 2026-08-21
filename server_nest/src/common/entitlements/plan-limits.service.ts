import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../errors/api-error.js';
import { EntitlementsService, UNLIMITED } from './entitlements.service.js';
import { ROLES } from '../constants/permissions.js';
import type { AppConfig } from '../../config/env.validation.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TARIF CHEGARASI — `middleware/enforceLimit.js` dagi `enforceLimit()`
 * ning KO'CHIRMASI.
 *
 * ⚠ NEGA KEYIN QO'SHILDI: Express `POST /auth/register-user` marshrutida
 * `enforceUserLimit` bor edi, NestJS'da esa YO'Q. Ya'ni NestJS orqali
 * tarifdagi limitdan ORTIQ foydalanuvchi yaratish mumkin edi —
 * paywall'ning JIMGINA teshigi.
 *
 * ── ⚠ YUMSHOQ REJIM (`ENFORCE_LIMITS=false`) ──
 * Limit oshsa ham BLOKLANMAYDI, faqat ogohlantirish yoziladi. Express'da
 * ham AYNAN shunday — bu bayroq mijozni to'satdan to'sib qo'ymaslik
 * uchun.
 *
 * ── ⚠ TEKSHIRUVNING O'ZI YIQILSA — O'TKAZAMIZ ──
 * Bu BIZNING ichki muammomiz, mijoz aybdor emas. Express bilan bir xil.
 * (Byudjet qatlamidan farqli: u YOPIQ yiqiladi, chunki u BIZNING
 * pulimizni himoya qiladi.)
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class PlanLimitsService {
  private readonly logger = new Logger('PlanLimits');
  private readonly enforce: boolean;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
  ) {
    this.enforce = config.get('ENFORCE_LIMITS', { infer: true }) as boolean;
  }

  /**
   * ⚠ KALIT ROLGA QARAB TANLANADI: o'quvchi uchun `max_students`,
   * qolganlari (xodim/o'qituvchi) uchun `max_users` — Express bilan
   * aynan bir xil.
   *
   * ⚠ ARXIVLANGAN (`isDeleted`) YOZUVLAR HISOBGA OLINMAYDI.
   */
  async assertUserLimit(role: string): Promise<void> {
    const featureKey = role === ROLES.STUDENT ? 'max_students' : 'max_users';
    try {
      const limit = this.entitlements.getLimit(featureKey);
      if (limit === UNLIMITED) return;

      const current = await this.prisma.user.count({
        where: {
          isDeleted: false,
          role: role === ROLES.STUDENT ? ROLES.STUDENT : { not: ROLES.STUDENT },
        },
      });

      if (current < limit) return;

      if (!this.enforce) {
        this.logger.warn(
          `Tarif limiti oshdi (soft rejim — bloklanmadi): ` +
            `${featureKey} ${current}/${limit}`,
        );
        return;
      }

      throw new ApiError(
        402, // Payment Required — tarifni oshirish kerak
        `Tarif limiti tugadi (${current}/${limit}). Tarifni oshiring.`,
        { code: 'LIMIT_EXCEEDED', details: { featureKey, current, limit } },
      );
    } catch (err) {
      // ⚠ 402 QAYTA TASHLANADI — u tekshiruv NATIJASI, nosozlik emas.
      if (err instanceof ApiError) throw err;
      this.logger.error(
        `Limit tekshiruvi xatosi (${featureKey}): ${(err as Error)?.message}`,
      );
    }
  }
}
