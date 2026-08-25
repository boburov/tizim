import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';

/** Yagona qatorli sozlama — `AttendanceSettings` naqshi. */
const DEFAULT_ID = 'default';

/**
 * Sozlama KESHI — 30 soniya.
 *
 * ── NEGA KESH ──
 * `get()` ISSIQ YO'LDA: har davomat belgilashda (20 o'quvchi = bitta
 * chaqiruv) va marketning har ochilishida o'qiladi. Keshsiz bitta dars
 * jurnali bir necha o'nlab bir xil SELECT tug'dirardi.
 *
 * ── NEGA AYNAN 30 SONIYA, 5 DAQIQA EMAS ──
 * Bu sozlamada O'CHIRGICH bor. "O'chirdim, lekin hali ham ishlayapti"
 * holati foydalanuvchi uchun buzuq tizim ko'rinishida bo'ladi va u
 * tugmani qayta-qayta bosa boshlaydi. `update()` keshni DARHOL
 * bekor qiladi — 30 soniya faqat boshqa jarayon (fon job) uchun
 * eng yomon holat.
 */
const CACHE_TTL_MS = 30 * 1000;

export interface CoinSettingsShape {
  id: string;
  isEnabled: boolean;
  marketEnabled: boolean;
  coinLabel: string;
  attendancePresentCoins: number;
  attendanceExcusedCoins: number;
  gradeMinValue: number;
  gradeCoinsPerPoint: number;
  dailyEarnLimit: number;
  orderAutoApprove: boolean;
  [key: string]: unknown;
}

@Injectable()
export class CoinSettingsService {
  private cache: { data: CoinSettingsShape; expiresAt: number } | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  invalidate(): void {
    this.cache = null;
  }

  /** Sozlama qatori — bo'lmasa yaratiladi (idempotent). */
  async get(): Promise<CoinSettingsShape> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.data;

    const row = (await this.prisma.coinSettings.upsert({
      where: { id: DEFAULT_ID },
      update: {},
      create: { id: DEFAULT_ID },
    })) as unknown as CoinSettingsShape;

    this.cache = { data: row, expiresAt: Date.now() + CACHE_TTL_MS };
    return row;
  }

  /**
   * ASOSIY O'CHIRGICH holati.
   *
   * ⚠ XATO YUTILADI VA `false` QAYTARILADI. Bu shox faqat AVTOMATIK
   * hisoblashda (davomat/baho) ishlatiladi: baza javob bermasa dars
   * jurnali SAQLANMAY qolmasligi kerak — tanga esa kutib turadi.
   */
  async isEnabled(): Promise<boolean> {
    try {
      return (await this.get()).isEnabled === true;
    } catch {
      return false;
    }
  }

  /** Market ham ochiqmi (asosiy o'chirgich + do'kon o'chirgichi). */
  async isMarketEnabled(): Promise<boolean> {
    const s = await this.get();
    return s.isEnabled === true && s.marketEnabled === true;
  }

  /**
   * Klient uchun OCHIQ konfiguratsiya.
   *
   * Ruxsatsiz o'qiladi (har qanday auth'langan foydalanuvchi): menyu
   * yozuvini va marshrutni ko'rsatish/yashirish qarori shunga tayanadi.
   * Ichida MAXFIY hech narsa yo'q — stavkalar o'quvchiga baribir
   * ko'rinishi kerak ("nima uchun necha tanga beriladi").
   */
  async publicConfig() {
    const s = await this.get();
    return {
      enabled: s.isEnabled === true,
      marketEnabled: s.isEnabled === true && s.marketEnabled === true,
      coinLabel: s.coinLabel,
      earn: {
        attendancePresent: s.attendancePresentCoins,
        attendanceExcused: s.attendanceExcusedCoins,
        gradeMinValue: s.gradeMinValue,
        gradeCoinsPerPoint: s.gradeCoinsPerPoint,
        dailyLimit: s.dailyEarnLimit,
      },
    };
  }

  async update(body: Record<string, unknown>, actorId?: string | null) {
    await this.get(); // qator borligiga kafolat

    const data: Record<string, unknown> = {};

    const bool = (key: string) => {
      if (body[key] !== undefined) data[key] = body[key] === true;
    };
    /** Manfiy bo'lmagan butun son. */
    const nat = (key: string, max: number) => {
      if (body[key] === undefined) return;
      const v = Number(body[key]);
      if (!Number.isInteger(v) || v < 0 || v > max) {
        throw new ApiError(400, `"${key}" 0 dan ${max} gacha butun son bo'lishi kerak`);
      }
      data[key] = v;
    };

    bool('isEnabled');
    bool('marketEnabled');
    bool('orderAutoApprove');

    if (body.coinLabel !== undefined) {
      const label = String(body.coinLabel).trim();
      if (!label || label.length > 24) {
        throw new ApiError(400, "Nom 1–24 belgidan iborat bo'lishi kerak");
      }
      data.coinLabel = label;
    }

    // ⚠ YUQORI CHEGARALAR ATAYLAB PAST. Stavka "1000" deb qo'yilsa
    // bitta dars jurnali o'n minglab tanga chiqarib, marketni bir
    // kunda ma'nosiz qilardi — va uni qaytarib olishning yo'li yo'q
    // (tarix o'zgarmas).
    nat('attendancePresentCoins', 1000);
    nat('attendanceExcusedCoins', 1000);
    nat('gradeCoinsPerPoint', 1000);
    nat('dailyEarnLimit', 1000000);

    if (body.gradeMinValue !== undefined) {
      const v = Number(body.gradeMinValue);
      // Baho shkalasi 1..5 (`Grade.value`).
      if (!Number.isInteger(v) || v < 1 || v > 5) {
        throw new ApiError(400, "Minimal baho 1 dan 5 gacha bo'lishi kerak");
      }
      data.gradeMinValue = v;
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, "Hech bo'lmaganda bitta maydon kerak");
    }

    if (actorId) data.updatedById = String(actorId);

    const row = await this.prisma.coinSettings.update({
      where: { id: DEFAULT_ID },
      data: data as never,
    });

    // ⚠ DARHOL: o'chirgich bosilgach keyingi so'rov YANGI holatni
    // ko'rishi kerak, aks holda admin "o'chdimi yo'qmi" deb bilmaydi.
    this.invalidate();

    return withLegacyId(row);
  }
}
