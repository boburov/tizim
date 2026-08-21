import { Prisma, PrismaClient } from '@prisma/client';
import {
  decimalNormalizationExtension,
  journalImmutabilityExtension,
} from './prisma.extensions.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KENGAYTIRILGAN PRISMA KLIENTI — YAGONA NUSXA.
 *
 * ── NEGA `class PrismaService extends PrismaClient` EMAS ──
 *
 * Bu NestJS'dagi eng keng tarqalgan naqsh (`admin_server` da ham shunday),
 * lekin BU YERDA U ISHLAMAYDI. Sabab: `$extends()` `this` ni o'zgartirmaydi —
 * u YANGI obyekt qaytaradi. Ya'ni sinfdan meros olingan nusxa kengaytmalarni
 * OLMAYDI.
 *
 * Agar shunday yozilsa, natija JIMGINA falokat bo'lardi:
 *   • `passwordHash` javoblarga sizib chiqardi;
 *   • pul ustunlari `Decimal` obyekti bo'lib qolardi va `a + b` SATR
 *     BIRIKTIRISHIGA aylanardi ("700000" + "300000" = "700000300000");
 *   • jurnal yozuvini tahrirlash to'silmay qolardi.
 * Uchalasi ham TypeScript'da xato bermaydi va testlar ham o'tib ketardi.
 *
 * ── SHUNING UCHUN ──
 *
 * Bazaviy klient shu modul ichida YOPIQ qoladi va tashqariga FAQAT
 * kengaytirilgan yuza chiqariladi. Bazaviyga yetib borishning yo'li yo'q,
 * ya'ni kimdir bilmasdan qo'riqchilarni chetlab o'ta olmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Bazaviy (kengaytirilmagan) klient.
 *
 * ALOHIDA funksiya — turi shundan KELTIRIB CHIQARILADI. Uni qo'lda
 * `PrismaClient` deb yozib bo'lmaydi: `omit` konstruktor parametri
 * natija turlarini O'ZGARTIRADI (`user` da endi `passwordHash` yo'q),
 * ya'ni standart generikli `PrismaClient` ga MOS KELMAYDI.
 */
const createBaseClient = () => {
  const logConfig: Prisma.LogDefinition[] =
    process.env.NODE_ENV === 'development'
      ? [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [{ emit: 'event', level: 'error' }];

  return new PrismaClient({
    // `passwordHash` HECH QACHON o'z-o'zidan qaytmaydi. Bu Mongoose'dagi
    // `select: false` ning aynan ekvivalenti. Ehtiyot chorasi ATAYLAB shu
    // qatlamda: xesh javobga tushishi uchun kimdir uni OCHIQ so'rashi kerak
    // bo'ladi — unutish bilan sizib chiqmaydi.
    //
    // Kerak bo'lganda (faqat login va parol tekshiruvida):
    //     prisma.user.findFirst({ omit: { passwordHash: false }, ... })
    omit: { user: { passwordHash: true } },
    log: logConfig,
  });
};

type BaseClient = ReturnType<typeof createBaseClient>;

/** Ichki. Faqat shu fayl ko'radi — tashqariga hech qachon chiqmaydi. */
let baseClient: BaseClient | null = null;

export const createExtendedPrismaClient = () => {
  const base = createBaseClient();
  baseClient = base;
  // TARTIB MUHIM va Express'dagi bilan AYNAN bir xil: avval decimal
  // normalizatsiyasi qo'llanadi, o'zgarmaslik qo'riqchisi esa uning
  // USTIGA qo'yiladi — ya'ni yozish amali sonlashtirishgacha to'siladi.
  return base
    .$extends(decimalNormalizationExtension)
    .$extends(journalImmutabilityExtension);
};

/** Kengaytmalar qo'llangandan keyingi klient turi. */
export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

/**
 * DI TOKENI VA TURI — bir xil nom bilan.
 *
 * TypeScript'da qiymat (`const`) va tur (`type`) alohida fazoda yashaydi,
 * shuning uchun ikkalasini `PrismaService` deb atash mumkin. Natijada
 * chaqiruv joyi Express koddagidek O'QILADI:
 *
 *     constructor(
 *       @Inject(PrismaService) private readonly prisma: PrismaService,
 *     ) {}
 *
 *     await this.prisma.user.findMany();   // `.client` yoki `.db` YO'Q
 *
 * Bu 42 000 qatorlik servis kodini ko'chirishda farqni eng kichik qiladi:
 * Express'dagi `prisma.user.findMany()` → `this.prisma.user.findMany()`.
 */
export const PrismaService = Symbol('PrismaService');
export type PrismaService = ExtendedPrismaClient;

/**
 * Bazaviy klientdagi log hodisalarini ulash.
 *
 * `$on` KENGAYTIRILGAN klientda YO'Q (Prisma uni olib tashlaydi), shuning
 * uchun u bazaviysiga ulanadi — Express'da ham aynan shunday qilingan.
 */
export const attachPrismaLogging = (
  onWarn: (e: unknown) => void,
  onError: (e: unknown) => void,
) => {
  if (!baseClient) return;
  baseClient.$on('error' as never, onError as never);
  if (process.env.NODE_ENV === 'development') {
    baseClient.$on('warn' as never, onWarn as never);
  }
};
