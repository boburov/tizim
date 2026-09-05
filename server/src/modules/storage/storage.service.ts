import fs from 'node:fs/promises';
import { formatBytes } from '../../common/utils/format-bytes.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAQLAGICH — `services/storage.service.js` EKVIVALENTI.
 *
 * ── KVOTA KAFOLATI (eng muhim qism) ──
 *
 * Band hajm ATOMIK hisoblagichda turadi (`StorageUsage`), agregatsiyada
 * EMAS. Sabab: agregatsiya faqat o'qish, kvota tekshiruvi esa
 * "o'qi → qaror qil → yoz". Ikki so'rov bir vaqtda o'qisa IKKALASI ham
 * "joy bor" javobini oladi va ikkalasi ham yozadi — chegara oshib
 * ketadi. Ko'p instansli deploy'da bu KAFOLATLANGAN holat, shuning
 * uchun joy YOZISHDAN OLDIN shartli `UPDATE ... WHERE` bilan band
 * qilinadi.
 *
 * ── FILIAL KO'LAMI ATAYLAB YO'Q ──
 *
 * Kvota BUTUN MARKAZNIKI (`key: "global"`) va fayllar filialga
 * bog'lanmagan. Bu Express xulqi va u O'ZGARTIRILMAYDI — filial ko'lami
 * "qo'shib qo'yilsa" kvota raqami filialga qarab boshqacha ko'rinardi
 * va sidebar indikatori bilan server qarori ajralib ketardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Mongo modelidagi konstanta shu yerga ko'chdi. */
export const USAGE_KEY = 'global';


/**
 * Fayl nomidan XAVFSIZ kengaytma.
 *
 * Nuqtadan keyingi 10 tagacha harf/raqam qolgani hammasi tashlanadi:
 * "rasm.png.exe" ham, "..%2f" ham zararsizlanadi.
 */
const safeExtension = (originalName: unknown): string => {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private get uploadDir(): string {
    return this.config.get<string>('UPLOAD_DIR') as string;
  }
  private get quotaBytes(): number {
    return Number(this.config.get('STORAGE_QUOTA_BYTES'));
  }
  private get maxUploadBytes(): number {
    return Number(this.config.get('MAX_UPLOAD_BYTES'));
  }

  /**
   * ⚠ IKKI STEK BIR XIL PAPKANI KO'RSATAYAPTIMI — ISHGA TUSHISHDA
   * OGOHLANTIRAMIZ.
   *
   * `UPLOAD_DIR` nisbiy bo'lsa Express (`server/`) va NestJS
   * (`server_nest/`) IKKI XIL papkani ko'radi, baza esa BITTA. O'shanda
   * NestJS orqali o'chirilgan fayl diskda qolib ketardi va kvota
   * hisoblagichi haqiqatdan uzoqlashardi — hech qanday xato bermasdan.
   */
  async onModuleInit(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      this.logger.warn(
        `Fayl papkasi topilmadi: ${this.uploadDir}. ` +
          "Ikki stek birga ishlayotgan bo'lsa `UPLOAD_DIR` MUTLAQ yo'l bo'lishi kerak — " +
          'aks holda fayllar diskdan o\'chmaydi va kvota hisobi buziladi.',
      );
    }
  }

  // ───────────────────────── KVOTA HISOBI ─────────────────────────

  private async aggregateFromFiles(): Promise<{ usedBytes: number; fileCount: number }> {
    const row = await this.prisma.storedFile.aggregate({
      where: { isDeleted: false },
      _sum: { size: true },
      _count: { _all: true },
    });
    return { usedBytes: row._sum.size || 0, fileCount: row._count._all || 0 };
  }

  /** Hisoblagich qatorini kafolatlaydi (birinchi ishga tushish). */
  private async ensureCounter() {
    const existing = await this.prisma.storageUsage.findUnique({
      where: { key: USAGE_KEY },
    });
    if (existing) return existing;

    // Eski o'rnatmalarda fayllar bor, hisoblagich yo'q — shuning uchun
    // noldan EMAS, MAVJUD fayllardan boshlaymiz.
    const { usedBytes } = await this.aggregateFromFiles();
    try {
      return await this.prisma.storageUsage.create({
        data: { key: USAGE_KEY, usedBytes, reconciledAt: new Date() },
      });
    } catch (err: any) {
      // Ikki instans bir vaqtda yaratmoqchi bo'lsa biri unique xatosini
      // oladi — bu xato emas, qator allaqachon bor degani.
      if (err?.code === 'P2002') {
        return this.prisma.storageUsage.findUnique({ where: { key: USAGE_KEY } });
      }
      throw err;
    }
  }

  /**
   * Hisoblagichni HAQIQAT bo'yicha qayta hisoblaydi.
   *
   * Kerak bo'ladigan holat: jarayon joyni band qilib, faylni yozishdan
   * OLDIN yiqilsa, hisoblagichda "band" bo'lgan bayt qolib ketadi. Bu
   * kvotani ASTA-SEKIN yeydi.
   */
  async reconcile() {
    const { usedBytes, fileCount } = await this.aggregateFromFiles();
    // Prisma `upsert` HAR DOIM yangisini qaytaradi, shuning uchun
    // eskisini (drift hisoblash uchun) OLDIN o'qib olamiz.
    const before = await this.prisma.storageUsage.findUnique({
      where: { key: USAGE_KEY },
    });
    await this.prisma.storageUsage.upsert({
      where: { key: USAGE_KEY },
      update: { usedBytes, reconciledAt: new Date() },
      create: { key: USAGE_KEY, usedBytes, reconciledAt: new Date() },
    });

    const drift = (before?.usedBytes ?? usedBytes) - usedBytes;
    if (drift !== 0) {
      this.logger.warn(
        `Saqlash hisoblagichi haqiqat bilan mos emas edi — tekislandi ` +
          `(drift=${drift}, usedBytes=${usedBytes}, fileCount=${fileCount})`,
      );
    }
    return { usedBytes, fileCount, drift };
  }

  /**
   * Joyni ATOMIK band qiladi. Sig'masa `null` (chaqiruvchi 507 beradi).
   *
   * ⚠ SHART `WHERE` ICHIDA: PostgreSQL `UPDATE ... WHERE` ni qator
   * darajasida atomik bajaradi, ya'ni ikkita parallel yuklash kvotani
   * BIRGALIKDA oshirib yubora olmaydi — ikkinchisining sharti
   * birinchisi yozgandan keyin tekshiriladi va `count = 0` qaytadi.
   *
   * ⚠ `updateMany` ATAYLAB (`update` EMAS): `update` faqat unique
   * maydon bo'yicha ishlaydi va qo'shimcha shart qo'ya olmaydi.
   */
  private async reserve(size: number) {
    await this.ensureCounter();
    const quota = this.quotaBytes;

    const res = await this.prisma.storageUsage.updateMany({
      where: { key: USAGE_KEY, usedBytes: { lte: quota - size } },
      data: { usedBytes: { increment: size } },
    });
    if (res.count !== 1) return null;

    return this.prisma.storageUsage.findUnique({ where: { key: USAGE_KEY } });
  }

  /** Band qilingan joyni qaytaradi (yozish yiqilsa yoki fayl o'chsa). */
  private async release(size: number): Promise<void> {
    if (!size) return;
    await this.prisma.storageUsage.updateMany({
      where: { key: USAGE_KEY },
      data: { usedBytes: { decrement: size } },
    });
    // Hisoblagich MANFIYGA tushib ketmasin (ikki marta release bo'lsa) —
    // manfiy qiymat keyingi kvota tekshiruvini YOLG'ON "bo'sh" qilib
    // ko'rsatardi.
    await this.prisma.storageUsage.updateMany({
      where: { key: USAGE_KEY, usedBytes: { lt: 0 } },
      data: { usedBytes: 0 },
    });
  }

  /**
   * Markazning fayl kvotasi holati.
   *
   * ⚠ KESH YO'Q — VA QO'SHILMASIN. Ilgari 15 soniyalik kesh bor edi va
   * aynan u XAVFLI edi: kvota tekshiruvi eskirgan, KICHIKROQ raqamni
   * ko'rib faylni o'tkazib yuborishi mumkin edi. Klient tomonda
   * TanStack allaqachon keshlaydi.
   */
  async getUsage() {
    const counter = await this.ensureCounter();
    const usedBytes = Math.max(0, counter?.usedBytes || 0);
    const quotaBytes = this.quotaBytes;
    const freeBytes = Math.max(0, quotaBytes - usedBytes);
    // Fayl SONI hisoblagichda saqlanmaydi — u kvota qaroriga ta'sir
    // qilmaydi, shuning uchun indekslangan `count` yetarli.
    const fileCount = await this.prisma.storedFile.count({ where: { isDeleted: false } });

    return {
      usedBytes,
      quotaBytes,
      freeBytes,
      fileCount,
      // Bitta fayl chegarasi ham shu javobda: forma "5 MB gacha" deb
      // yozishi uchun alohida so'rov kerak bo'lmasin.
      maxUploadBytes: this.maxUploadBytes,
      percent: quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0,
      // "To'lgan" = eng katta ruxsat etilgan fayl ham sig'maydi. Aynan
      // shu paytda UI fayl tanlashni butunlay bekor qiladi.
      isFull: freeBytes < this.maxUploadBytes,
    };
  }

  /** Bitta fayl chegarasi (kvotadan MUSTAQIL tekshiruv). */
  private assertFileSize(size: number): void {
    if (size > this.maxUploadBytes) {
      throw new ApiError(
        413,
        `Fayl juda katta. Bitta fayl uchun chegara: ${formatBytes(this.maxUploadBytes)}`,
        {
          code: 'FILE_TOO_LARGE',
          details: { size, maxUploadBytes: this.maxUploadBytes },
        },
      );
    }
  }

  private async quotaError(size: number): Promise<ApiError> {
    const usage = await this.getUsage();
    return new ApiError(
      507,
      `Saqlash joyi to'lgan (${formatBytes(usage.usedBytes)} / ${formatBytes(
        usage.quotaBytes,
      )}). Eski fayllarni o'chirib joy bo'shating.`,
      {
        code: 'STORAGE_QUOTA_EXCEEDED',
        details: {
          usedBytes: usage.usedBytes,
          quotaBytes: usage.quotaBytes,
          freeBytes: usage.freeBytes,
          incomingBytes: size,
        },
      },
    );
  }

  /**
   * Fayl sig'adimi — HECH NARSA yozmasdan tekshiradi (forma uchun).
   *
   * ⚠ Bu FAQAT oldindan ogohlantirish. Haqiqiy kafolat `saveBuffer`
   * ichidagi atomik band qilishda: shu funksiya "sig'adi" desa ham,
   * ayni o'sha lahzada boshqa so'rov joyni egallab qo'yishi mumkin.
   */
  async assertQuota(incomingBytes: unknown) {
    const size = Number(incomingBytes) || 0;
    this.assertFileSize(size);

    const usage = await this.getUsage();
    if (usage.usedBytes + size > usage.quotaBytes) throw await this.quotaError(size);
    return usage;
  }

  /**
   * Buferni diskka yozadi va `StoredFile` qatorini yaratadi.
   *
   * ⚠ TARTIB MUHIM VA O'ZGARTIRILMASIN:
   *   1) fayl o'lchami chegarasi   → 413
   *   2) joyni ATOMIK band qilish  → 507 (kvota kafolati SHU YERDA)
   *   3) diskka yozish             → yiqilsa joy qaytariladi
   *   4) `StoredFile` yaratish     → yiqilsa fayl ham, joy ham qaytariladi
   *
   * 2-qadam yozishdan OLDIN turgani uchun ikki parallel so'rov
   * birgalikda kvotadan oshira olmaydi.
   */
  async saveBuffer({
    buffer,
    originalName,
    mimeType,
    userId,
    purpose = 'assignment',
  }: {
    buffer: Buffer;
    originalName?: string;
    mimeType?: string;
    userId?: string | null;
    purpose?: string;
  }) {
    if (!buffer?.length) throw new ApiError(400, "Fayl bo'sh");
    const size = buffer.length;

    this.assertFileSize(size);
    if (!(await this.reserve(size))) throw await this.quotaError(size);

    // YYYY/MM bo'yicha papkalash: bitta papkada o'n minglab fayl
    // to'planib qolmasin.
    const now = new Date();
    const subDir = path.join(
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
    );
    const storedName = `${crypto.randomUUID()}${safeExtension(originalName)}`;
    const relPath = path.join(subDir, storedName);
    const absDir = path.join(this.uploadDir, subDir);
    const absPath = path.join(this.uploadDir, relPath);

    try {
      await fs.mkdir(absDir, { recursive: true });
      await fs.writeFile(absPath, buffer);
    } catch (err) {
      // Yozilmagan fayl joy egallamasligi kerak.
      await this.release(size);
      throw err;
    }

    try {
      const created = await this.prisma.storedFile.create({
        data: {
          originalName: String(originalName || 'fayl').slice(0, 255),
          storedName,
          relPath,
          mimeType: mimeType || 'application/octet-stream',
          size,
          purpose,
          uploadedById: userId || null,
        } as never,
      });
      return withLegacyId(created);
    } catch (err) {
      // Baza yozuvi yaratilmasa diskdagi fayl YETIM qolardi: u ro'yxatda
      // ko'rinmaydi, lekin joyni egallab turadi. Ikkalasini ham
      // qaytaramiz.
      await fs.unlink(absPath).catch(() => null);
      await this.release(size);
      throw err;
    }
  }

  /** Faylning diskdagi to'liq yo'li. */
  absolutePathOf(storedFile: { relPath: string }): string {
    return path.join(this.uploadDir, storedFile.relPath);
  }

  /**
   * CHEK / KVITANSIYA faylini ID bo'yicha oladi.
   *
   * ⚠ `purpose = "receipt"` SHARTI MAJBURIY: usiz
   * `GET /expenses/receipt/:id` ixtiyoriy `StoredFile` ni beradigan
   * UMUMIY fayl o'qish yo'liga aylanardi va `expenses.read` huquqi
   * bor xodim vazifa ilovalarini ham (o'quvchi topshirig'i, ichki
   * hujjat) o'qib olardi.
   *
   * ⚠ 404, 403 EMAS: fayl bor-yo'qligi oshkor qilinmaydi.
   */
  async getReceipt(id: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: String(id), purpose: 'receipt', isDeleted: false } as never,
    });
    if (!file) throw new ApiError(404, 'Chek topilmadi');
    return withLegacyId(file);
  }

  /** Faylni o'qiydi. Diskda topilmasa 404. */
  async readFile(storedFile: { relPath: string; id?: string; _id?: string }) {
    try {
      return await fs.readFile(this.absolutePathOf(storedFile));
    } catch (err) {
      this.logger.error(
        `Saqlangan fayl diskda topilmadi (${storedFile.id || storedFile._id}): ${String(err)}`,
      );
      throw new ApiError(404, 'Fayl topilmadi');
    }
  }

  /**
   * Faylni diskdan o'chiradi, qatorni ARXIVLAYDI va joyni bo'shatadi.
   *
   * ⚠ QATOR ATAYLAB BUTUNLAY O'CHIRILMAYDI — vazifa tarixida "fayl bor
   * edi" degani ko'rinib tursin.
   *
   * ⚠ `telegramFileId` NOLLANADI — BOTDAN MUSTAQIL YETKAZISH uchun
   * muhim: kesh qolsa, o'chirilgan fayl Telegram keshidan qayta
   * yuborilishi mumkin edi.
   *
   * ⚠ Hisoblagich FAQAT qator haqiqatan "o'chirilgan"ga o'tganda
   * kamayadi (`res.count`) — aks holda ikki marta o'chirish so'rovi
   * joyni IKKI MARTA bo'shatib, hisobni buzardi.
   */
  async removeFile(
    storedFile: { id?: string; _id?: string; relPath: string; size?: number } | null,
    userId?: string | null,
  ): Promise<void> {
    if (!storedFile) return;

    const res = await this.prisma.storedFile.updateMany({
      where: { id: storedFile.id || storedFile._id, isDeleted: false },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId || null,
        telegramFileId: null,
      },
    });

    if (!res.count) return; // allaqachon o'chirilgan — qayta hisoblamaymiz

    await fs.unlink(this.absolutePathOf(storedFile)).catch(() => null);
    await this.release(storedFile.size || 0);
  }

  /** Telegram `file_id` keshi — keyingi yuborishlar tez bo'lsin. */
  async cacheTelegramFileId(fileId?: string, telegramFileId?: string): Promise<void> {
    if (!fileId || !telegramFileId) return;
    await this.prisma.storedFile
      .update({ where: { id: String(fileId) }, data: { telegramFileId } })
      .catch(() => null);
  }
}
