import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * SOG'LIQ TEKSHIRUVI — Faza 1 uchun eng kichik hajmda.
 *
 * `GET /api/health` javobi Express'dagi bilan AYNAN bir xil
 * (`server/src/routes/index.js`): `{ success, message }`. Sabab —
 * keyinchalik trafik NestJS'ga o'tganda monitoring va klient uchun
 * hech narsa o'zgarmasligi kerak.
 *
 * Baza tekshiruvi ATAYLAB ALOHIDA manzilda (`/api/health/db`):
 * `/api/health` "jarayon tirikmi?" degan savolga javob beradi va u
 * bazaga bog'liq bo'lmasligi kerak — aks holda baza sekinlashganda
 * balanslovchi sog'lom jarayonni o'chirib yuborardi.
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Jarayon tirik. Bazaga TEGMAYDI. Express bilan bir xil javob shakli. */
  @Get()
  check() {
    return { success: true, message: 'Server ishlayapti' };
  }

  /**
   * Baza ulanishi. Faqat `SELECT 1` — hech narsa o'qimaydi va yozmaydi.
   */
  @Get('db')
  async checkDb() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        success: true,
        message: 'PostgreSQL ulanishi sog\'lom',
        data: { database: 'up', latencyMs: Date.now() - startedAt },
      };
    } catch {
      // Sabab QAYTARILMAYDI: ulanish satri va host nomi xato matnida
      // chiqib ketishi mumkin. Batafsili logda qoladi.
      return {
        success: false,
        message: 'PostgreSQL ulanishi yo\'q',
        code: 'DATABASE_UNAVAILABLE',
        data: { database: 'down', latencyMs: Date.now() - startedAt },
      };
    }
  }
}
