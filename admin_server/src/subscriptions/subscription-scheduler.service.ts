import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';

/** Tekshiruv oralig'i (daqiqa). */
const INTERVAL_MIN = Number(process.env.SUBSCRIPTION_CHECK_INTERVAL_MIN || 15);

/**
 * Ilova ko'tarilgandan keyin birinchi tekshiruvgacha kutish.
 * Boot paytida DB migratsiyasi/ulanish tugashiga vaqt beradi.
 */
const FIRST_RUN_DELAY_MS = 60_000;

/**
 * Obuna muddatini kuzatuvchi ichki jadval.
 *
 * NEGA `@nestjs/schedule` EMAS: bu yerda bitta takrorlanuvchi vazifa bor,
 * uning uchun butun boshli cron kutubxonasini bog'lash ortiqcha. `setInterval`
 * aynan shuni bajaradi va bog'liqlik qo'shmaydi.
 *
 * Bir vaqtda ikkita tekshiruv ketmaydi (`running` bayrog'i): sekin VPS'da
 * skript bir necha soniya ishlaydi, ustma-ust tushsa bitta tenantni ikki
 * marta to'xtatishga urinardik.
 */
@Injectable()
export class SubscriptionSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SubscriptionSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private firstRun?: NodeJS.Timeout;
  private running = false;
  private lastRunAt: Date | null = null;
  private lastResult: unknown = null;

  constructor(private readonly subscriptions: SubscriptionsService) {}

  onModuleInit() {
    const ms = Math.max(1, INTERVAL_MIN) * 60_000;

    this.firstRun = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.tick(), ms);

    const cfg = this.subscriptions.config();
    this.logger.log(
      `Obuna kuzatuvi yoqildi: har ${INTERVAL_MIN} daqiqada` +
        (cfg.autoSuspend
          ? `, avtomatik to'xtatish YOQILGAN (grace ${cfg.graceHours} soat)`
          : ", avtomatik to'xtatish O'CHIRILGAN"),
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  /** Panel "hozir tekshir" tugmasi uchun. */
  async runNow() {
    if (this.running) {
      return { ok: false, message: 'Tekshiruv allaqachon ketmoqda' };
    }
    const result = await this.tick();
    return { ok: true, ...result };
  }

  status() {
    return {
      intervalMinutes: INTERVAL_MIN,
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      ...this.subscriptions.config(),
    };
  }

  private async tick() {
    if (this.running) return { skipped: true } as const;
    this.running = true;
    try {
      const result = await this.subscriptions.sweepExpired();
      this.lastRunAt = new Date();
      this.lastResult = result;
      return result;
    } catch (err: any) {
      // Tekshiruv yiqilsa ilova to'xtamasligi kerak — keyingi oraliqda
      // qaytadan uriniladi.
      this.logger.error(`Muddat tekshiruvi xatosi: ${err.message}`);
      this.lastRunAt = new Date();
      this.lastResult = { error: err.message };
      return { error: err.message } as const;
    } finally {
      this.running = false;
    }
  }
}
