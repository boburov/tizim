import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  EntitlementsService,
  type EntitlementsPayload,
} from './entitlements.service.js';

/** Bazadagi yagona qator identifikatori. */
const ROW_ID = 'singleton';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TARIF KESHINING DOIMIY NUSXASI.
 *
 * ── NEGA KERAK ──
 *
 * `EntitlementsService` XOTIRADA turadi va PM2 qayta ishga tushganda
 * BO'SHAYDI. Limitlar uchun bu zararsiz edi (ochiq yiqilish — bo'sh kesh
 * "cheksiz" degani). Lekin MODUL DARVOZALARI yopiq yiqiladi: bo'sh kesh
 * "hamma bo'lim o'chiq" degani bo'lardi va har deploy mijoz ilovasini
 * qorong'i qilardi.
 *
 * ── VA NEGA VAQT MUHRI SAQLANADI ──
 *
 * ⚠ Tiklashda `updatedAt` ORIGINAL qiymati qaytariladi, `new Date()` EMAS.
 * Aks holda 10 kun aloqasiz turgan server har qayta ishga tushganda
 * "hozirgina yangilandim" deb 72 soatlik muhlatni QAYTA BOSHLARDI — ya'ni
 * pullik modullar cheksiz bepul qolardi. Aynan shu teshikni yopish uchun
 * ustun alohida saqlanadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class EntitlementCacheStore implements OnModuleInit {
  private readonly logger = new Logger('EntitlementCache');

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Ko'tarilishda oxirgi ma'lum holatni tiklaydi.
   *
   * ⚠ XATO YUTILADI: kesh jadvali yo'q yoki buzuq bo'lsa ham ilova
   * ko'tarilishi SHART. Bunda darvozalar yopiq holatda qoladi va
   * birinchi heartbeat ularni ochadi — mijoz uchun bu bir necha
   * daqiqalik kechikish, ilovaning umuman ko'tarilmasligidan ko'ra
   * yaxshiroq.
   */
  async onModuleInit(): Promise<void> {
    try {
      const row = await this.prisma.entitlementCache.findUnique({
        where: { id: ROW_ID },
      });
      if (!row) {
        this.logger.debug('Saqlangan tarif keshi yo\'q — birinchi heartbeat kutilmoqda');
        return;
      }
      this.entitlements.set(row.payload as EntitlementsPayload, row.receivedAt);
      this.logger.log(
        `Tarif keshi tiklandi (${row.receivedAt.toISOString()} holatiga)`,
      );
    } catch (err) {
      this.logger.warn(`Tarif keshi tiklanmadi: ${(err as Error)?.message}`);
    }
  }

  /**
   * Heartbeat javobini saqlaydi. Xato yutiladi — saqlanmaganligi
   * ishlayotgan so'rovni yiqitmasligi kerak, u eng ko'pi bilan keyingi
   * qayta ishga tushishda eski holatni bildiradi.
   */
  async save(payload: EntitlementsPayload, receivedAt: Date): Promise<void> {
    try {
      const data = { payload: payload as object, receivedAt };
      await this.prisma.entitlementCache.upsert({
        where: { id: ROW_ID },
        create: { id: ROW_ID, ...data },
        update: data,
      });
    } catch (err) {
      this.logger.warn(`Tarif keshi saqlanmadi: ${(err as Error)?.message}`);
    }
  }
}
