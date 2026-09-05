import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../errors/api-error.js';
import { EntitlementsService, UNLIMITED } from './entitlements.service.js';
import {
  BRANCH_LIMIT_REACHED,
  evaluateBranchCreation,
  resolveEffectiveBranchConfig,
  type EffectiveBranchConfig,
} from './branch-limit.js';
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
  private readonly envBranchesEnabled: boolean;
  private readonly envBranchLimit: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
  ) {
    this.enforce = config.get('ENFORCE_LIMITS', { infer: true }) as boolean;
    this.envBranchesEnabled = config.get('BRANCHES_ENABLED', { infer: true }) as boolean;
    this.envBranchLimit = config.get('BRANCH_LIMIT', { infer: true }) as number;
  }

  // ─────────────────────────────────────────────────────────── FILIALLAR

  /**
   * AMALDAGI filial konfiguratsiyasi: heartbeat (tirik) yoki `.env`
   * (oxirgi ma'lum). Tanlov mantiqi `branch-limit.ts` da — sof funksiya.
   *
   * O'qish uchun ham ochiq: `/auth/me` shu qiymatni klientga beradi,
   * shunda panel chegara tugaganini OLDINDAN ko'rsata oladi. Klient
   * bunga TAYANMAYDI — u faqat ko'rsatadi, to'sish shu servisda.
   */
  branchConfig(): EffectiveBranchConfig {
    const state = this.entitlements.get();
    const rawLimit = state.limits['max_branches'];
    const rawEnabled = state.limits['branches_enabled'];

    return resolveEffectiveBranchConfig({
      entitlementLimit: typeof rawLimit === 'number' ? rawLimit : null,
      entitlementBranchesEnabled:
        typeof rawEnabled === 'number' ? rawEnabled > 0 : null,
      envLimit: this.envBranchLimit,
      envBranchesEnabled: this.envBranchesEnabled,
    });
  }

  /** Hozirgi FAOL filiallar soni (arxivlangani hisobga olinmaydi). */
  async branchCount(): Promise<number> {
    return this.prisma.branch.count({ where: { isDeleted: false } });
  }

  /** Panel/`/auth/me` uchun: "Used: 3 / Limit: 5 / Remaining: 2". */
  async branchUsage() {
    const cfg = this.branchConfig();
    const used = await this.branchCount();
    const verdict = evaluateBranchCreation({
      used,
      limit: cfg.limit,
      branchesEnabled: cfg.branchesEnabled,
    });
    return {
      branchesEnabled: cfg.branchesEnabled,
      used: verdict.used,
      limit: verdict.limit,
      remaining: verdict.remaining,
      limitReached: !verdict.allowed,
      unlimited: verdict.limit === UNLIMITED,
    };
  }

  /**
   * YANGI FILIAL OCHISHNI TO'SADI — SERVER TOMONIDA.
   *
   * ⚠⚠ `ENFORCE_LIMITS=false` (yumshoq rejim) BU YERDA AMAL QILMAYDI.
   *
   * Yumshoq rejim `assertUserLimit` uchun o'ylab topilgan va sababi
   * aniq: o'quvchi/xodim soni mijozning KUNDALIK ishida O'Z-O'ZIDAN
   * o'sadi, uni chegarada to'satdan to'xtatish ishni buzadi.
   *
   * Filial esa BOSHQACHA: u tasodifan paydo bo'lmaydi, uni ONGLI ravishda
   * ochishadi va u mahsulotning SOTUV chegarasi. Bu yerda ham yumshoq
   * rejim ishlaganda "cheksiz filial" bitta `.env` bayrog'i orqali
   * ochilib qolardi — ya'ni butun talab jimgina bekor bo'lardi.
   *
   * ⚠ TEKSHIRUVNING O'ZI YIQILSA — O'TKAZAMIZ (`assertUserLimit` bilan
   * bir xil): sanash xatosi BIZNING nosozligimiz, mijoz aybdor emas.
   */
  async assertBranchLimit(): Promise<void> {
    const cfg = this.branchConfig();
    if (cfg.limit === UNLIMITED) return;

    let used: number;
    try {
      used = await this.branchCount();
    } catch (err) {
      this.logger.error(
        `Filial soni o'qilmadi — chegara tekshirilmadi: ${(err as Error)?.message}`,
      );
      return;
    }

    const verdict = evaluateBranchCreation({
      used,
      limit: cfg.limit,
      branchesEnabled: cfg.branchesEnabled,
    });
    if (verdict.allowed) return;

    this.logger.warn(
      `Filial chegarasi to'sdi: ${verdict.used}/${verdict.limit} ` +
        `(manba: ${cfg.source}, rejim: ${cfg.branchesEnabled ? 'ko\'p filialli' : 'yakka markaz'})`,
    );

    throw new ApiError(
      402, // Payment Required — tarifni kengaytirish kerak
      verdict.message as string,
      {
        code: BRANCH_LIMIT_REACHED,
        details: {
          used: verdict.used,
          limit: verdict.limit,
          remaining: verdict.remaining,
          branchesEnabled: cfg.branchesEnabled,
        },
      },
    );
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * FILIALLI REJIM SOTIB OLINGANMI — filiallararo endpointlar uchun.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── NEGA KERAK ──
   *
   * Filialsiz tarifda markazda BITTA filial bo'ladi, ya'ni "filiallararo
   * taqqoslash", "har filial P&L" kabi javoblar TEXNIK jihatdan ishlaydi
   * — faqat bitta qatorli. Ular sotilmagan bo'lsa ham ochiq turardi.
   *
   * Klient tomonida `/org` allaqachon yo'q (`SuperAdminGuard`), lekin
   * qo'riqchi XAVFSIZLIK EMAS: endpointga to'g'ridan-to'g'ri murojaat
   * qilish mumkin. Bu — o'sha bo'shliqni yopadigan yagona server
   * to'sig'i.
   *
   * ── ⚠ 402, 403 EMAS ──
   *
   * "Ruxsatingiz yo'q" emas, "tarifingizda yo'q". Mijoz nima qilishi
   * kerakligini bilishi kerak — global darvoza ham shu kodni ishlatadi
   * (`global-feature-gate.ts`).
   *
   * ── ⚠ TEKSHIRUV YIQILSA — O'TKAZAMIZ ──
   *
   * `branchConfig()` `.env` va keshdan o'qiydi. Ikkalasi ham yo'q bo'lsa
   * `resolveEffectiveBranchConfig` standartni beradi; bu yerda qo'shimcha
   * "ochiq yiqilish" yo'q, chunki qaror allaqachon o'sha funksiyada.
   */
  assertBranchesEnabled(): void {
    const cfg = this.branchConfig();
    if (cfg.branchesEnabled) return;

    this.logger.warn(
      `Filiallararo so'rov to'sildi — filialli rejim yoqilmagan (manba: ${cfg.source})`,
    );

    throw new ApiError(
      402,
      "Filiallararo hisobotlar tarifingizda mavjud emas",
      {
        code: 'FEATURE_NOT_AVAILABLE',
        details: { featureKey: 'branches', branchesEnabled: false },
      },
    );
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
