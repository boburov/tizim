import { Controller, Get } from '@nestjs/common';
import { ModuleFeaturesService } from '../../common/features/module-features.service.js';
import { TelegramBotService } from '../../bot/telegram-bot.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `GET /features` — MIJOZ UI'SI UCHUN YECHILGAN IMKONIYATLAR XARITASI.
 *
 * ── ⚠ NEGA `/auth/me` GA QO'SHILMADI ──
 *
 * `/auth/me` mijozda 5 daqiqa keshlanadi (TanStack `staleTime`) va
 * serverda ham rol keshi 5 daqiqa (`PermissionService.roleCache`). Ikkisi
 * qo'shilib, yoqilgan modul mijozga 10 daqiqagacha ko'rinmasdi — bu esa
 * "darhol yangilash" g'oyasini butunlay yo'qqa chiqarardi.
 *
 * Aynan shu sabab `coin` bayrog'i ham alohida so'rovda (`/coins/config`)
 * turadi. Bu endpoint o'sha naqshning umumlashtirilgani.
 *
 * ── ⚠ BU ENDPOINT DARVOZA ORTIDA QOLMAYDI ──
 *
 * O'zini o'zi yopib qo'yolmaydi: mijoz nima o'chiqligini bilishi uchun
 * aynan shu javob kerak.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('features')
export class FeaturesController {
  constructor(
    private readonly features: ModuleFeaturesService,
    private readonly bots: TelegramBotService,
  ) {}

  /**
   * `{ features: { imports: true, "imports.finance": false }, stale: false }`
   *
   * `stale` — mijozga emas, BIZGA: qo'llab-quvvatlashda "nega bo'lim
   * yo'q" savoliga javob beradi (aloqa uzilganmi yoki tarifda yo'qmi).
   */
  @Get()
  list(): {
    features: Record<string, boolean>;
    stale: boolean;
    planKey: string | null;
    bot: { enabled: boolean };
  } {
    const { stale, planKey } = this.features.diagnostics();
    return {
      features: this.features.enabledMap(),
      stale,
      planKey,
      // ── ⚠ NEGA `features` ICHIDA EMAS, ALOHIDA MAYDON ──
      //
      // Bu IKKI XIL narsa va ularni bitta bayroqqa qo'shish diagnostikani
      // yo'q qilardi:
      //   • `features['bot-auth']` / `features.notifications` — TIJORAT
      //     qarori: mijoz sotib olganmi;
      //   • `bot.enabled` — TEXNIK holat: `.env` da bayroq yoqiqmi va
      //     token bormi (`settings.service.ts` tokensiz bayroqni majburan
      //     `false` qiladi).
      //
      // Aralashtirilsa "nega Telegram yo'q?" savoliga javob berolmasdik:
      // sotilmaganmi yoki token qo'yilmaganmi — bilinmasdi.
      bot: { enabled: this.bots.isConfigured() },
    };
  }
}
