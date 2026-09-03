import { CanActivate, Injectable } from '@nestjs/common';
import { PlanLimitsService } from '../entitlements/plan-limits.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIALLARARO ENDPOINTLAR — FILIALLI TARIF TALAB QILINADI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NIMANI YOPADI ──
 *
 * "Filiallarni taqqoslash", "har filial P&L", "filiallararo o'quvchi
 * ko'chirish" kabi javoblarni. Filialsiz tarifda markazda bitta filial
 * bo'ladi, ya'ni ular TEXNIK jihatdan ishlaydi — faqat bitta qatorli —
 * va shu sababli sotilmagan bo'lsa ham jimgina ochiq turardi.
 *
 * ── ⚠ NEGA KLIENTDAGI QO'RIQCHI YETARLI EMAS ──
 *
 * `SuperAdminGuard` filialsiz tarifda `/org` ni butunlay yopadi, lekin u
 * NAVIGATSIYA, xavfsizlik emas (fayl boshidagi izohda shunday yozilgan).
 * Endpointga to'g'ridan-to'g'ri murojaat qilish mumkin. Bu guard — o'sha
 * bo'shliqni yopadigan yagona server to'sig'i.
 *
 * ── ⚠ NEGA GUARD, MIDDLEWARE EMAS ──
 *
 * Bu yerda AsyncLocalStorage konteksti ochilmaydi (`auth.middleware.ts`
 * dagi holatdan farqli) — faqat `true`/istisno kerak, ya'ni guard yetadi
 * va u marshrut darajasida ko'rinib turadi.
 */
@Injectable()
export class BranchesEnabledGuard implements CanActivate {
  constructor(private readonly planLimits: PlanLimitsService) {}

  canActivate(): boolean {
    // 402 tashlaydi — "ruxsat yo'q" emas, "tarifda yo'q".
    this.planLimits.assertBranchesEnabled();
    return true;
  }
}
