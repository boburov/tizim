import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import {
  PrismaService,
  createExtendedPrismaClient,
  attachPrismaLogging,
  type ExtendedPrismaClient,
} from './prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRISMA MODULI
 *
 * `@Global()` — ATAYLAB. Bazaga kirish deyarli har bir biznes modulida
 * kerak bo'ladi; global bo'lmasa `imports: [PrismaModule]` ni 47 ta modulga
 * yozish kerak edi va bittasini unutish faqat ishga tushirishda bilinardi.
 *
 * YAGONA NUSXA KAFOLATI: `useFactory` moduldagi provayder sifatida BIR
 * MARTA chaqiriladi (Nest provayderlari standart holda singleton). Ya'ni
 * butun ilovada bitta `PrismaClient` va bitta ulanish hovuzi bo'ladi.
 * Har `new PrismaClient()` o'z hovuzini ochadi va ular to'planib
 * PostgreSQL'ni `too many clients` bilan yiqitadi — Express tomonda bu
 * `globalThis` keshi bilan yechilgan, bu yerda esa DI'ning o'zi yechadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: (): ExtendedPrismaClient => createExtendedPrismaClient(),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Prisma');

  constructor(
    @Inject(PrismaService) private readonly prisma: ExtendedPrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    attachPrismaLogging(
      (e) => this.logger.warn(JSON.stringify(e)),
      (e) => this.logger.error(JSON.stringify(e)),
    );
    await this.prisma.$connect();
    // Ulanish HAQIQATAN tirikligini tekshiramiz: `$connect()` hovuz
    // yaratadi, lekin birinchi so'rovgacha xatoni ko'rsatmasligi mumkin.
    // Express `index.js` da ham aynan shu tekshiruv bor.
    await this.prisma.$queryRaw`SELECT 1`;
    this.logger.log('PostgreSQL ulandi (Prisma)');
  }

  /**
   * `onApplicationShutdown` — `onModuleDestroy` EMAS.
   *
   * Shutdown hook'lari `app.enableShutdownHooks()` bilan yoqiladi va
   * SIGTERM/SIGINT da ishlaydi. Ulanish eng oxirida yopilishi kerak:
   * undan oldin yopilsa, to'xtayotgan boshqa provayderlar bazaga
   * murojaat qilib xato berardi.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.log(`PostgreSQL uzildi${signal ? ` (${signal})` : ''}`);
  }
}
