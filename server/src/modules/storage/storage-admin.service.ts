import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { CLEANUP_FREQUENCIES, FREQUENCY_DAYS } from '../../common/constants/storage.js';
import { StorageService } from './storage.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAQLAGICH BOSHQARUVI — `services/storageAdmin.service.js` EKVIVALENTI.
 *
 * Bu yerdagi amallar BUTUN MARKAZNING fayllarini o'chiradi va ularni
 * QAYTARIB BO'LMAYDI — shuning uchun barchasi `storage.manage` ostida.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SETTINGS_ID = 'default';

/**
 * Bir yurishda ko'pi bilan nechta fayl o'chiriladi.
 *
 * ⚠ CHEGARASIZ QOLDIRILMASIN: 50 000 faylli markazda job soatlab
 * ishlab, diskni va bazani band qilardi. Qolgani keyingi yurishda
 * o'chadi — avto-tozalash shoshilinch ish emas.
 */
const CLEANUP_BATCH = 500;

@Injectable()
export class StorageAdminService {
  private readonly logger = new Logger('StorageAdmin');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /**
   * YAGONA QATOR: `id` ning o'zi "default" (sxemadagi `@default`).
   * `upsert` yo'q bo'lsa sxema standartlari bilan yaratadi.
   */
  getSettings() {
    return this.prisma.storageSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  async updateSettings(body: Record<string, any>) {
    // Qator mavjudligini kafolatlaymiz (birinchi tahrirda ham ishlashi uchun).
    await this.getSettings();

    const data: Record<string, any> = {};
    if (body.autoCleanupEnabled !== undefined) {
      data.autoCleanupEnabled = !!body.autoCleanupEnabled;
    }
    if (body.frequency !== undefined) {
      if (!CLEANUP_FREQUENCIES.includes(body.frequency)) {
        throw new ApiError(400, "Noto'g'ri chastota");
      }
      data.frequency = body.frequency;
    }
    if (body.olderThanDays !== undefined) {
      const v = Number(body.olderThanDays);
      if (!Number.isInteger(v) || v < 1 || v > 3650) {
        throw new ApiError(400, "Muddat 1 kundan 3650 kungacha bo'lishi kerak");
      }
      data.olderThanDays = v;
    }

    return this.prisma.storageSettings.update({ where: { id: SETTINGS_ID }, data });
  }

  /** Keyingi avto-yurish sanasi (yoqilmagan bo'lsa `null`). */
  nextRunAt(settings: Record<string, any> | null): Date | null {
    if (!settings?.autoCleanupEnabled) return null;
    const stepDays = (FREQUENCY_DAYS as Record<string, number>)[settings.frequency] || 30;
    const base = settings.lastRunAt ? new Date(settings.lastRunAt) : new Date();
    return new Date(base.getTime() + stepDays * 24 * 60 * 60 * 1000);
  }

  /** Avto-tozalash vaqti keldimi (job har kuni shu savolni beradi). */
  private isDue(settings: Record<string, any> | null): boolean {
    if (!settings?.autoCleanupEnabled) return false;
    if (!settings.lastRunAt) return true; // hech qachon yurmagan — hoziroq
    return this.nextRunAt(settings)! <= new Date();
  }

  /**
   * Fayllarni o'chirish filtri.
   *
   * ⚠ IKKALASI HAM BERILMASA XATO. Filtrsiz o'chirish "hammasini
   * o'chirish"ga aylanib ketardi va buni TASODIFAN chaqirish juda oson
   * bo'lardi.
   */
  private buildFilter({ all, olderThanDays }: { all?: boolean; olderThanDays?: unknown }) {
    const filter: Record<string, any> = { isDeleted: false };

    if (all) return filter;

    const days = Number(olderThanDays);
    if (!Number.isFinite(days) || days < 1) {
      throw new ApiError(400, "Muddat yoki 'hammasi' bayrog'i ko'rsatilishi kerak");
    }
    filter.createdAt = { lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    return filter;
  }

  /**
   * Nechta fayl va qancha joy o'chishini OLDINDAN hisoblaydi (HECH
   * NARSA o'chirmasdan). Tasdiqlash oynasi shu raqamni ko'rsatadi.
   */
  async previewCleanup({ all = false, olderThanDays }: {
    all?: boolean; olderThanDays?: unknown;
  } = {}) {
    const where = this.buildFilter({ all, olderThanDays });
    const row = await this.prisma.storedFile.aggregate({
      where,
      _count: { _all: true },
      _sum: { size: true },
    });
    return { files: row._count._all || 0, bytes: row._sum.size || 0 };
  }

  /**
   * Tozalashni BAJARADI.
   *
   * Fayllar bittalab o'chiriladi (`storage.removeFile`): u diskdan
   * o'chirishni, qatorni arxivlashni va kvota hisoblagichini
   * kamaytirishni BIRGA bajaradi.
   *
   * ⚠ BITTASI YIQILSA QOLGANLARI DAVOM ETADI — bitta buzuq fayl butun
   * tozalashni to'xtatib qo'ymasligi kerak.
   */
  async runCleanup({ all = false, olderThanDays, userId }: {
    all?: boolean; olderThanDays?: unknown; userId?: string | null;
  } = {}) {
    const filter = this.buildFilter({ all, olderThanDays });

    const files = await this.prisma.storedFile.findMany({
      where: filter,
      select: { id: true, relPath: true, size: true },
      orderBy: { createdAt: 'asc' }, // eng eskisidan boshlaymiz
      take: CLEANUP_BATCH,
    });

    let deleted = 0;
    let freedBytes = 0;
    const deletedIds: string[] = [];

    for (const f of files) {
      try {
        await this.storage.removeFile(withLegacyId(f) as never, userId);
        deleted += 1;
        freedBytes += f.size || 0;
        deletedIds.push(f.id);
      } catch (err) {
        this.logger.warn(`Faylni tozalashda xato — o'tkazib yuborildi (${f.id}): ${String(err)}`);
      }
    }

    // ⚠ BIRIKTIRMA HAVOLASINI UZAMIZ: aks holda vazifa tafsilotida
    // yuklab bo'lmaydigan "Yuklab olish" tugmasi turaverardi.
    if (deletedIds.length) {
      await this.prisma.assignment.updateMany({
        where: { fileId: { in: deletedIds } },
        data: { fileId: null, fileRemovedAt: new Date() },
      });
    }

    // Chegaraga tegdikmi — demak yana qolgan bo'lishi mumkin.
    const remaining = await this.prisma.storedFile.count({ where: filter });

    return { deleted, freedBytes, remaining };
  }

  /**
   * Avto-tozalash yurishi (job kuniga bir marta chaqiradi).
   * Vaqti kelmagan bo'lsa hech narsa qilmaydi.
   */
  async runScheduledCleanup() {
    const settings = await this.getSettings();
    if (!this.isDue(settings)) return { skipped: true };

    const result = await this.runCleanup({
      olderThanDays: settings.olderThanDays,
      userId: null,
    });

    await this.prisma.storageSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        lastRunAt: new Date(),
        lastRunDeleted: result.deleted,
        lastRunFreedBytes: result.freedBytes,
      },
    });

    this.logger.log(
      `Avto-tozalash bajarildi (${result.deleted} fayl, ${result.freedBytes} bayt, ` +
        `chastota=${settings.frequency})`,
    );
    return { skipped: false, ...result };
  }

  /** Fayllar ro'yxati (admin ko'radi: nima joy egallayapti). */
  async listFiles({ page, limit, skip, sort = 'size' }: {
    page: number; limit: number; skip: number; sort?: string;
  }) {
    const where = { isDeleted: false };
    // ⚠ STANDART TARTIB — KATTASIDAN kichigiga: "joy qayoqqa ketdi?"
    // degan savolga javob BIRINCHI qatorda turishi kerak.
    const orderBy = sort === 'date' ? { createdAt: 'desc' as const } : { size: 'desc' as const };

    const [items, total] = await Promise.all([
      this.prisma.storedFile.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.storedFile.count({ where }),
    ]);

    // Fayl qaysi vazifaga tegishli — admin KONTEKSTSIZ o'chirmasin.
    const assignments = items.length
      ? await this.prisma.assignment.findMany({
          where: { fileId: { in: items.map((f) => f.id) } },
          select: { id: true, title: true, fileId: true },
        })
      : [];
    const byFile = new Map(assignments.map((a) => [String(a.fileId), a]));

    return {
      items: items.map((f) => ({
        ...(withLegacyId(f) as Record<string, unknown>),
        // Javobda `assignment` kaliti QOLADI (eski shakl) — klient
        // shunga tayangan bo'lishi mumkin.
        assignment: byFile.get(String(f.id)) ? withLegacyId(byFile.get(String(f.id))!) : null,
      })),
      total,
    };
  }

  /** Bitta faylni o'chirish (admin qo'lda). */
  async removeFileById(fileId: string, userId?: string | null) {
    const file = await this.prisma.storedFile.findUnique({
      where: { id: String(fileId) },
    });
    if (!file || file.isDeleted) throw new ApiError(404, 'Fayl topilmadi');

    await this.storage.removeFile(withLegacyId(file) as never, userId);
    await this.prisma.assignment.updateMany({
      where: { fileId: file.id },
      data: { fileId: null, fileRemovedAt: new Date() },
    });

    return { _id: file.id, freedBytes: file.size || 0 };
  }
}
