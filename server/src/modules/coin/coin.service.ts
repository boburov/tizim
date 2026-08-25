import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { localTodayMidnight, dateKeyOf, TZ_OFFSET_MIN } from '../../common/utils/date.js';
import { userBranchCondition, branchFilter } from '../../common/als/branch-context.js';
import { CoinSettingsService } from './coin-settings.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TANGA XIZMATI — hamyon va o'zgarmas ledger.
 *
 * ── UCHTA QOIDA, UCHALASI HAM BAZA DARAJASIDA MAJBURLANADI ──
 *
 *  1. BITTA MANBA BITTA MARTA TO'LAYDI. `sourceKey` qisman unique
 *     indeks. Davomat qayta belgilanishi ODATIY hodisa — himoyasiz
 *     bitta dars cheksiz tanga chiqarardi.
 *
 *  2. BALANS MANFIY BO'LMAYDI. Sarflash SHARTLI UPDATE bilan bajariladi
 *     (`where: { balance: { gte: amount } }`), ya'ni ikki bir vaqtli
 *     xariddan faqat bittasi o'tadi. Postgres qatorni qulflaydi —
 *     "avval o'qib, keyin yozish" naqshidagi poyga bu yerda YO'Q.
 *
 *  3. LEDGER O'ZGARMAS. Yozuv tahrirlanmaydi va o'chirilmaydi; xato
 *     tuzatilsa TESKARI yozuv qo'shiladi. Balans esa ledger'ning
 *     keshi — ikkalasi AYNI tranzaksiyada yoziladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type CoinKind = 'attendance' | 'grade' | 'purchase' | 'refund' | 'manual';

export interface AwardEntry {
  userId: string;
  /** Musbat — topish. Nol bo'lsa yozuv YARATILMAYDI. */
  delta: number;
  kind: CoinKind;
  reason?: string;
  /** Idempotentlik kaliti, mas. `attendance:<id>`. */
  sourceKey?: string | null;
  refId?: string | null;
  branchId?: string | null;
  createdById?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Kunlik chegara FAQAT avtomatik manbalarga tegishli. */
const AUTO_KINDS: CoinKind[] = ['attendance', 'grade'];

@Injectable()
export class CoinService {
  private readonly logger = new Logger('Coin');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly settings: CoinSettingsService,
  ) {}

  // ─────────────────────────── HAMYON ───────────────────────────

  /** Hamyon — bo'lmasa yaratiladi. Poygada (P2002) mavjudi qaytariladi. */
  private async ensureAccount(userId: string) {
    const id = String(userId);
    const found = await this.prisma.coinAccount.findUnique({ where: { userId: id } });
    if (found) return found;
    try {
      return await this.prisma.coinAccount.create({ data: { userId: id } });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== 'P2002') throw err;
      // Ikki so'rov bir vaqtda yaratdi — ikkinchisi mavjudini oladi.
      const again = await this.prisma.coinAccount.findUnique({ where: { userId: id } });
      if (!again) throw err;
      return again;
    }
  }

  async getSummary(userId: string) {
    const account = await this.ensureAccount(userId);
    return withLegacyId({
      ...account,
      // Klient "bugun nechta topdim" ni ko'rsatadi — ikkinchi so'rovsiz.
      earnedToday: await this.earnedTodayFor([String(userId)]).then(
        (m) => m.get(String(userId)) || 0,
      ),
    });
  }

  async getBalance(userId: string): Promise<number> {
    const account = await this.prisma.coinAccount.findUnique({
      where: { userId: String(userId) },
      select: { balance: true },
    });
    return account?.balance ?? 0;
  }

  /** Bir nechta foydalanuvchi balansi — ro'yxat ekranlari uchun. */
  async balancesFor(userIds: string[]): Promise<Map<string, number>> {
    const ids = [...new Set(userIds.map(String))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.coinAccount.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, balance: true },
    });
    return new Map(rows.map((r) => [String(r.userId), r.balance]));
  }

  // ─────────────────────── KUNLIK CHEGARA ───────────────────────

  /**
   * MAHALLIY kunning HAQIQIY boshlanish nuqtasi (UTC instant).
   *
   * ⚠ `localTodayMidnight()` ni TO'G'RIDAN-TO'G'RI ISHLATIB BO'LMAYDI:
   * u mahalliy kalendar kunini UTC-yarim tun KO'RINISHIDA qaytaradi
   * (`dateKey` bilan mos bo'lishi uchun), ya'ni Toshkent uchun
   * haqiqiy instantdan 5 soat KEYIN. Solishtiruv `createdAt` — haqiqiy
   * instant — bilan bo'lgani uchun ofset qaytariladi. Aks holda
   * chegara oynasi har kuni 00:00–05:00 oralig'ini KECHAGI kunga
   * qo'shib yuborardi.
   */
  private localDayStartInstant(now: Date = new Date()): Date {
    return new Date(localTodayMidnight(now).getTime() - TZ_OFFSET_MIN * 60 * 1000);
  }

  /** Bugun avtomatik topilgan tanga — foydalanuvchi kesimida. */
  private async earnedTodayFor(userIds: string[]): Promise<Map<string, number>> {
    const ids = [...new Set(userIds.map(String))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.coinTransaction.groupBy({
      by: ['userId'],
      where: {
        userId: { in: ids },
        kind: { in: AUTO_KINDS as never },
        delta: { gt: 0 },
        createdAt: { gte: this.localDayStartInstant() },
      },
      _sum: { delta: true },
    });
    return new Map(rows.map((r) => [String(r.userId), r._sum.delta || 0]));
  }

  // ─────────────────────────── YOZISH ───────────────────────────

  /**
   * BITTA yozuv — hamyon va ledger AYNI tranzaksiyada.
   *
   * `sourceKey` allaqachon ishlatilgan bo'lsa `null` qaytaradi va
   * HECH NARSA yozmaydi (xato EMAS — bu kutilgan holat).
   */
  private async writeOne(entry: AwardEntry): Promise<Record<string, unknown> | null> {
    const delta = Math.trunc(Number(entry.delta) || 0);
    if (delta === 0) return null;

    const userId = String(entry.userId);
    await this.ensureAccount(userId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        let balanceAfter: number;

        if (delta > 0) {
          const updated = await tx.coinAccount.update({
            where: { userId },
            data: {
              balance: { increment: delta },
              totalEarned: { increment: delta },
              lastEarnedAt: new Date(),
            },
          });
          balanceAfter = updated.balance;
        } else {
          const amount = -delta;
          // ⚠ SHARTLI UPDATE — yagona poygaga chidamli shakl. `count = 0`
          // "mablag' yetmadi" degani va bu yerda BIRORTA qator
          // o'zgarmagan bo'ladi.
          const res = await tx.coinAccount.updateMany({
            where: { userId, balance: { gte: amount } },
            data: { balance: { decrement: amount }, totalSpent: { increment: amount } },
          });
          if (res.count === 0) throw new ApiError(400, 'Tanga yetarli emas');
          const after = await tx.coinAccount.findUnique({
            where: { userId },
            select: { balance: true },
          });
          balanceAfter = after?.balance ?? 0;
        }

        return (await tx.coinTransaction.create({
          data: {
            userId,
            delta,
            balanceAfter,
            kind: entry.kind as never,
            reason: entry.reason || '',
            sourceKey: entry.sourceKey || null,
            refId: entry.refId ? String(entry.refId) : null,
            branchId: entry.branchId ? String(entry.branchId) : null,
            createdById: entry.createdById ? String(entry.createdById) : null,
          },
        })) as unknown as Record<string, unknown>;
      });
    } catch (err: unknown) {
      // Idempotentlik: shu manba allaqachon to'langan.
      if ((err as { code?: string })?.code === 'P2002') return null;
      throw err;
    }
  }

  /**
   * TO'PLAM BO'LIB TANGA BERISH — davomat/baho ilgagi shuni chaqiradi.
   *
   * ⚠ BLOKLAMAYDI VA YIQITMAYDI. Chaqiruvchi (davomat servisi) buni
   * `void ...catch()` bilan chaqiradi: tanga hisoblanmagani uchun DARS
   * JURNALI saqlanmay qolishi mumkin emas. Shuning uchun bu yerda
   * ham har yozuv alohida himoyalangan.
   */
  async awardMany(entries: AwardEntry[]): Promise<{ awarded: number; coins: number }> {
    const positive = entries.filter((e) => Number(e.delta) > 0);
    if (positive.length === 0) return { awarded: 0, coins: 0 };

    const settings = await this.settings.get();
    if (!settings.isEnabled) return { awarded: 0, coins: 0 };

    const limit = Number(settings.dailyEarnLimit) || 0;
    // ⚠ BITTA so'rov bilan — o'quvchi boshiga alohida so'rov 25 kishilik
    // guruhda 25 ta qo'shimcha SELECT degani bo'lardi.
    const earnedToday =
      limit > 0 ? await this.earnedTodayFor(positive.map((e) => e.userId)) : new Map();

    let awarded = 0;
    let coins = 0;

    for (const entry of positive) {
      let delta = Math.trunc(Number(entry.delta));

      if (limit > 0) {
        const already = earnedToday.get(String(entry.userId)) || 0;
        const remaining = limit - already;
        if (remaining <= 0) continue;
        // Chegaraga TEGIB o'tadi, oshib ketmaydi: qolganini beramiz.
        if (delta > remaining) delta = remaining;
        earnedToday.set(String(entry.userId), already + delta);
      }

      try {
        const row = await this.writeOne({ ...entry, delta });
        if (row) {
          awarded += 1;
          coins += delta;
        }
      } catch (err) {
        // Bitta o'quvchining tangasi yozilmagani qolganlarini
        // to'xtatmasligi kerak.
        this.logger.warn(`Tanga yozilmadi (user=${entry.userId}): ${err}`);
      }
    }

    return { awarded, coins };
  }

  // ─────────────── AVTOMATIK MANBALAR (ILGAKLAR) ───────────────

  /**
   * DAVOMAT UCHUN TANGA.
   *
   * `docs` — `attendance.service.ts` `bulkRecord` qaytargan yozuvlar.
   * Idempotentlik kaliti YOZUV ID'siga bog'langan (`attendance:<id>`),
   * ya'ni holat qayta belgilansa ikkinchi marta to'lanmaydi.
   *
   * ⚠ HOLAT KEYIN "absent" GA O'ZGARSA TANGA QAYTARILMAYDI. Bu
   * ATAYLAB: berilgan rag'batni qaytarib olish o'quvchi uchun
   * jazoga o'xshaydi va balans "o'z-o'zidan kamaydi" degan shikoyat
   * tug'diradi. Xato bo'lsa admin qo'lda tuzatadi (tarixda ko'rinadi).
   */
  async awardForAttendance(
    docs: { id?: string; studentId?: string; status?: string }[],
    branchId?: string | null,
  ): Promise<void> {
    const settings = await this.settings.get();
    if (!settings.isEnabled) return;

    const rate: Record<string, number> = {
      present: Number(settings.attendancePresentCoins) || 0,
      excused: Number(settings.attendanceExcusedCoins) || 0,
    };

    const entries: AwardEntry[] = [];
    for (const doc of docs) {
      if (!doc?.id || !doc?.studentId) continue;
      const delta = rate[String(doc.status)] || 0;
      if (delta <= 0) continue;
      entries.push({
        userId: String(doc.studentId),
        delta,
        kind: 'attendance',
        reason: doc.status === 'excused' ? 'Sababli qoldirish' : 'Darsga qatnashdi',
        sourceKey: `attendance:${doc.id}`,
        refId: String(doc.id),
        branchId: branchId || null,
      });
    }

    if (entries.length) await this.awardMany(entries);
  }

  /**
   * BAHO UCHUN TANGA — `value × gradeCoinsPerPoint`, `gradeMinValue` dan past
   * bahoda BERILMAYDI.
   */
  async awardForGrades(
    docs: { id?: string; studentId?: string; value?: number }[],
    branchId?: string | null,
  ): Promise<void> {
    const settings = await this.settings.get();
    if (!settings.isEnabled) return;

    const perPoint = Number(settings.gradeCoinsPerPoint) || 0;
    if (perPoint <= 0) return;
    const min = Number(settings.gradeMinValue) || 0;

    const entries: AwardEntry[] = [];
    for (const doc of docs) {
      if (!doc?.id || !doc?.studentId) continue;
      const value = Number(doc.value) || 0;
      if (value < min) continue;
      entries.push({
        userId: String(doc.studentId),
        delta: value * perPoint,
        kind: 'grade',
        reason: `${value} ball uchun`,
        sourceKey: `grade:${doc.id}`,
        refId: String(doc.id),
        branchId: branchId || null,
      });
    }

    if (entries.length) await this.awardMany(entries);
  }

  // ─────────────────── MARKET UCHUN (ichki) ───────────────────

  /**
   * XARID — tranzaksiya ICHIDA chaqiriladi.
   *
   * ⚠ `tx` MAJBURIY: tanga yechish va buyurtma yaratish BITTA
   * tranzaksiyada bo'lishi kerak. Alohida bo'lsa buyurtma yaratishdagi
   * xato tangani yeb ketardi (yoki teskarisi — mahsulot tekinga
   * ketardi).
   */
  async spendInTx(
    tx: {
      coinAccount: {
        updateMany: (a: unknown) => Promise<{ count: number }>;
        findUnique: (a: unknown) => Promise<{ balance: number } | null>;
      };
      coinTransaction: { create: (a: unknown) => Promise<unknown> };
    },
    {
      userId,
      amount,
      reason,
      refId,
      branchId,
      sourceKey,
      kind = 'purchase',
    }: {
      userId: string;
      amount: number;
      reason?: string;
      refId?: string | null;
      branchId?: string | null;
      sourceKey?: string | null;
      kind?: CoinKind;
    },
  ): Promise<number> {
    const value = Math.trunc(Number(amount) || 0);
    if (value <= 0) throw new ApiError(400, "Summa noto'g'ri");

    const res = await tx.coinAccount.updateMany({
      where: { userId: String(userId), balance: { gte: value } },
      data: { balance: { decrement: value }, totalSpent: { increment: value } },
    });
    if (res.count === 0) throw new ApiError(400, 'Tangangiz yetarli emas');

    const after = await tx.coinAccount.findUnique({
      where: { userId: String(userId) },
      select: { balance: true },
    });
    const balanceAfter = after?.balance ?? 0;

    await tx.coinTransaction.create({
      data: {
        userId: String(userId),
        delta: -value,
        balanceAfter,
        kind,
        reason: reason || '',
        sourceKey: sourceKey || null,
        refId: refId ? String(refId) : null,
        branchId: branchId ? String(branchId) : null,
      },
    });

    return balanceAfter;
  }

  /** QAYTARISH — rad etilgan/bekor qilingan buyurtma uchun, tranzaksiya ichida. */
  async refundInTx(
    tx: {
      coinAccount: { update: (a: unknown) => Promise<{ balance: number }> };
      coinTransaction: { create: (a: unknown) => Promise<unknown> };
    },
    {
      userId,
      amount,
      reason,
      refId,
      branchId,
      sourceKey,
    }: {
      userId: string;
      amount: number;
      reason?: string;
      refId?: string | null;
      branchId?: string | null;
      sourceKey?: string | null;
    },
  ): Promise<number> {
    const value = Math.trunc(Number(amount) || 0);
    if (value <= 0) return 0;

    const updated = await tx.coinAccount.update({
      where: { userId: String(userId) },
      data: {
        balance: { increment: value },
        // ⚠ `totalSpent` KAMAYTIRILADI, `totalEarned` OSHIRILMAYDI:
        // qaytarilgan tanga "topilgan" emas. Aks holda o'quvchi
        // sotib olib-bekor qilib "topgan tanga" statistikasini
        // cheksiz shishira olardi.
        totalSpent: { decrement: value },
      },
    });

    await tx.coinTransaction.create({
      data: {
        userId: String(userId),
        delta: value,
        balanceAfter: updated.balance,
        kind: 'refund',
        reason: reason || 'Buyurtma bekor qilindi',
        sourceKey: sourceKey || null,
        refId: refId ? String(refId) : null,
        branchId: branchId ? String(branchId) : null,
      },
    });

    return updated.balance;
  }

  // ─────────────────────── QO'LDA (ADMIN) ───────────────────────

  /**
   * ADMIN QO'LDA TANGA BERADI YOKI OLIB QO'YADI.
   *
   * `sourceKey` YO'Q — qo'lda berilgan tanga takrorlanishi MUMKIN
   * (har hafta sovg'a). Idempotentlik bu yerda xato bo'lardi.
   */
  async manualAdjust(
    { userId, delta, reason }: { userId: string; delta: number; reason?: string },
    actor: { _id?: string; id?: string } | undefined,
    branchId?: string | null,
  ) {
    const value = Math.trunc(Number(delta) || 0);
    if (value === 0) throw new ApiError(400, "Miqdor noldan farqli bo'lishi kerak");
    if (Math.abs(value) > 100000) throw new ApiError(400, 'Miqdor juda katta');

    const user = await this.prisma.user.findFirst({
      where: { id: String(userId), isDeleted: false },
      select: { id: true },
    });
    if (!user) throw new ApiError(404, 'Foydalanuvchi topilmadi');

    const row = await this.writeOne({
      userId: String(userId),
      delta: value,
      kind: 'manual',
      reason: reason || (value > 0 ? "Qo'lda berildi" : "Qo'lda olib qo'yildi"),
      branchId: branchId || null,
      createdById: actor ? String(actor._id || actor.id) : null,
    });

    if (!row) throw new ApiError(409, 'Yozuv yaratilmadi');
    return withLegacyId(row);
  }

  // ─────────────────────────── O'QISH ───────────────────────────

  async history(
    userId: string,
    { page = 1, limit = 20, kind }: { page?: number; limit?: number; kind?: string },
  ) {
    const where: Record<string, unknown> = { userId: String(userId) };
    if (kind) where.kind = kind;

    const [items, total] = await Promise.all([
      this.prisma.coinTransaction.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.coinTransaction.count({ where: where as never }),
    ]);

    return { items: withLegacyIds(items), total };
  }

  /**
   * ═════════════════════════════════════════════════════════════════
   * IQTISODIYOT HOLATI — admin uchun.
   *
   * "Qancha tanga chiqarildi va qanchasi hali sarflanmagan" — market
   * narxlarini qo'yishdan OLDIN javob berilishi kerak bo'lgan savol.
   * Muomaladagi tanga ko'p bo'lsa arzon mahsulot bir kunda supurib
   * ketiladi.
   *
   * ── UCHTA JAVOB, UCHTA SHAKL ──
   *   `circulating`  → BITTA raqam (sarlavha raqami)
   *   `flow`         → VAQT QATORI (chiqarildi ↕ sarflandi)
   *   `bySource`     → KESIM (qaysi manba qancha chiqardi)
   *
   * ⚠ MIJOZ HISOBLAMAYDI. Granularity ham, kunlik bo'shliqlar ham
   * SHU YERDA to'ldiriladi. Aks holda "kun" ta'rifi ikki joyda
   * bo'lardi va ular muqarrar ravishda ajralib ketardi — grafik
   * jadval bilan mos kelmay qolardi.
   * ═════════════════════════════════════════════════════════════════
   */
  async stats({ days = 30 }: { days?: number } = {}) {
    // ⚠ CHEGARA: 1..180 kun. Cheklovsiz `?days=100000` butun ledgerni
    // xotiraga tortardi.
    const windowDays = Math.min(180, Math.max(1, Math.trunc(Number(days) || 30)));

    // Oyna MAHALLIY kun chegarasidan boshlanadi — grafikdagi ustun
    // `dateKey` bilan bir xil kunni bildirishi uchun.
    const todayStart = this.localDayStartInstant();
    const from = new Date(todayStart.getTime() - (windowDays - 1) * DAY_MS);

    const [issued, spent, accounts, orders, rows] = await Promise.all([
      this.prisma.coinTransaction.aggregate({
        where: { delta: { gt: 0 } },
        _sum: { delta: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { delta: { lt: 0 } },
        _sum: { delta: true },
      }),
      this.prisma.coinAccount.aggregate({
        _sum: { balance: true },
        _count: { _all: true },
      }),
      this.prisma.marketOrder.count(),
      // ⚠ FILTRLASH VA GURUHLASH JS'DA, XOM SQL'DA EMAS.
      //
      // Postgres kun bo'yicha guruhlay olardi (`date_trunc`), lekin
      // o'shanda FILIAL KO'LAMINI qo'lda SQL'ga yozishga to'g'ri
      // kelardi — ya'ni "kim nimani ko'radi" degan qoidaning
      // IKKINCHI nusxasi paydo bo'lardi. Ko'lam bitta joyda
      // (`branchFilter`) qolishi undan muhimroq: tanga ledgeri
      // markazda oyiga bir necha ming qator, ya'ni bu yo'l arzon.
      this.prisma.coinTransaction.findMany({
        where: { createdAt: { gte: from }, ...branchFilter('branchId') } as never,
        select: { createdAt: true, delta: true, kind: true },
      }),
    ]);

    // ── GRANULARITY: 31 kundan uzun oyna HAFTAGA yig'iladi ──
    // 90 ta ustun ekranda o'qilmaydigan tarashaga aylanadi.
    const granularity: 'day' | 'week' = windowDays > 31 ? 'week' : 'day';
    const bucketMs = granularity === 'week' ? 7 * DAY_MS : DAY_MS;

    const bucketStart = (at: Date): number => {
      const offset = at.getTime() - from.getTime();
      return from.getTime() + Math.floor(offset / bucketMs) * bucketMs;
    };

    // ⚠ BO'SH KUNLAR HAM TO'LDIRILADI. Faqat harakat bo'lgan kunlar
    // qaytarilsa, recharts ularni TENG oraliqda chizadi va uch kunlik
    // tanaffus bir kunlik bo'lib ko'rinardi — ya'ni grafik yolg'on
    // gapirardi.
    const buckets = new Map<number, { issued: number; spent: number }>();
    for (let t = from.getTime(); t <= todayStart.getTime(); t += bucketMs) {
      buckets.set(t, { issued: 0, spent: 0 });
    }

    const bySource = new Map<string, { coins: number; count: number }>();

    for (const row of rows) {
      const key = bucketStart(row.createdAt);
      const bucket = buckets.get(key);
      if (bucket) {
        if (row.delta > 0) bucket.issued += row.delta;
        else bucket.spent += -row.delta;
      }
      // Kesim FAQAT chiqarilgan tangani ko'rsatadi: "qaysi manba
      // qancha chiqardi". Sarflash (`purchase`) manba emas, u
      // oqimning ikkinchi tomoni va u yerda ikki marta sanalardi.
      if (row.delta > 0) {
        const prev = bySource.get(row.kind) || { coins: 0, count: 0 };
        bySource.set(row.kind, { coins: prev.coins + row.delta, count: prev.count + 1 });
      }
    }

    const flow = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({
        // Sana MAHALLIY kun kaliti sifatida ("YYYY-MM-DD") — mijoz
        // vaqt zonasini qayta hisoblamasligi uchun.
        date: dateKeyOf(new Date(t + TZ_OFFSET_MIN * 60 * 1000)),
        issued: v.issued,
        spent: v.spent,
      }));

    return {
      totalIssued: issued._sum.delta || 0,
      // `_sum` manfiy keladi — musbat ko'rinishga keltiramiz.
      totalSpent: Math.abs(spent._sum.delta || 0),
      circulating: accounts._sum.balance || 0,
      walletCount: accounts._count._all || 0,
      orderCount: orders,
      window: {
        days: windowDays,
        granularity,
        from: dateKeyOf(new Date(from.getTime() + TZ_OFFSET_MIN * 60 * 1000)),
        to: dateKeyOf(new Date(todayStart.getTime() + TZ_OFFSET_MIN * 60 * 1000)),
      },
      flow,
      bySource: [...bySource.entries()]
        .map(([kind, v]) => ({ kind, ...v }))
        .sort((a, b) => b.coins - a.coins),
    };
  }

  /**
   * REYTING — eng ko'p tanga to'plaganlar.
   *
   * `totalEarned` bo'yicha, `balance` bo'yicha EMAS: balans sarflagandan
   * keyin tushadi va reyting "hech narsa sotib olmagan" o'quvchini
   * mukofotlab qo'yardi — ya'ni marketdan foydalanmaslikka undardi.
   *
   * ── KO'LAM: `userBranchCondition()`, QO'LDA YOZILGAN FILTR EMAS ──
   *
   * ⚠ Bu yerda `branchAssignments.some(...)` ni qo'lda yozish JIMGINA
   * BO'SH REYTING berardi. Sabab: o'quvchi filialga odatda
   * `homeBranchId` orqali bog'lanadi, `branchAssignments` esa xodimlar
   * uchun ishlatiladi. Ya'ni filtr sintaktik to'g'ri, natija esa har
   * doim bo'sh — va hech qanday xato chiqmaydi.
   *
   * `userBranchCondition()` ikkala yo'lni ham qamraydi va butun
   * kodbazada "kim shu filialda" degan savolning YAGONA javobi.
   */
  async leaderboard({ limit = 10 }: { limit?: number } = {}) {
    const condition = userBranchCondition();

    const rows = await this.prisma.coinAccount.findMany({
      where: {
        totalEarned: { gt: 0 },
        user: {
          isDeleted: false,
          isActive: true,
          ...(condition ? { AND: [condition] } : {}),
        },
      } as never,
      orderBy: { totalEarned: 'desc' },
      take: Math.min(50, Math.max(1, limit)),
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
    return withLegacyIds(rows);
  }
}
