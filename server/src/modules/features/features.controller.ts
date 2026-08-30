import { Controller, Get } from '@nestjs/common';
import { ModuleFeaturesService } from '../../common/features/module-features.service.js';

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
  constructor(private readonly features: ModuleFeaturesService) {}

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
  } {
    const { stale, planKey } = this.features.diagnostics();
    return { features: this.features.enabledMap(), stale, planKey };
  }
}
