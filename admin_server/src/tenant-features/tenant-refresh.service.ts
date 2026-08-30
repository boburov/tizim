import { Injectable, Logger } from '@nestjs/common';
import type { Tenant } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DARHOL YANGILASH TURTKISI.
 *
 * Dev panelda modul yoqilganda mijoz 15 daqiqa kutmasligi kerak: to'lovni
 * qilgan odam ilovasini yangilaydi va hech narsa o'zgarmaganini ko'radi.
 * O'chirishda esa teskarisi muhim — bo'lim yana 15 daqiqa ishlab turmasin.
 *
 * ── ⚠ LIMITLAR BU YERDAN YUBORILMAYDI ──
 *
 * So'rov BO'SH: "borib o'zing ol" degan turtki, xolos. Payload yuborilsa
 * yangi ishonch chegarasi ochilardi — sirni bilgan har kim tenantga
 * xohlagan tarifni yozib qo'yolardi. Yo'nalish o'zgarmaydi: limitlarni
 * DOIM tenant tortib oladi, biz faqat "hozir tort" deymiz.
 *
 * ── ⚠ HECH QACHON XATO TASHLAMAYDI ──
 *
 * Turtki yetib bormasa ham o'zgarish BAZAGA YOZILGAN va keyingi
 * heartbeat (15 daqiqa) uni baribir olib boradi. Shuning uchun tarmoq
 * nosozligi admin paneldagi saqlashni yiqitmaydi — aks holda tenant
 * o'chib turganda konfiguratsiyani umuman o'zgartirib bo'lmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class TenantRefreshService {
  private readonly logger = new Logger('TenantRefresh');

  /**
   * @returns turtki yetib bordimi. `false` — xato EMAS, shunchaki
   *          "keyingi heartbeat'da yetadi".
   */
  async poke(tenant: Pick<Tenant, 'id' | 'serverIp' | 'port' | 'heartbeatSecret'>): Promise<boolean> {
    if (!tenant.serverIp || !tenant.heartbeatSecret) {
      this.logger.debug(
        `Tenant ${tenant.id}: manzil yoki sir yo'q — heartbeat kutiladi`,
      );
      return false;
    }

    const url = `http://${tenant.serverIp}:${tenant.port}/api/internal/entitlements/refresh`;

    // ⚠ 5 SONIYA. Bu chaqiruv admin paneldagi SAQLASH so'rovi ichida
    // turadi: o'chib qolgan tenant admin UI'sini osiltirib qo'ymasin.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-heartbeat-secret': tenant.heartbeatSecret },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Tenant ${tenant.id} turtkisi rad etildi (${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `Tenant ${tenant.id} turtkisi yetib bormadi: ${(err as Error)?.message}`,
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
