import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { assertGroupActive } from '../../common/helpers/group-state.js';
import { localTodayMidnight } from '../../common/utils/date.js';
import { branchFilter, runWithBranchContext } from '../../common/als/branch-context.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { StudentPaymentService } from './student-payment.service.js';
import { CoursePriceService, PRICE_SOURCES } from '../courses/course-price.service.js';
import { TeacherSalaryService } from '../teacher-salary/teacher-salary.service.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GURUHNING OYLIK NARXI (`GroupFee`) — Express
 * `finance/services/groupFee.service.js` NING KO'CHIRMASI.
 *
 * IDEMPOTENTLIK: `@@unique([groupId, year, month])` — HAQIQIY (qisman emas)
 * unique indeks, shuning uchun Prisma'ning tabiiy `upsert` i ishlatiladi.
 * Bir guruh-oy uchun ikkinchi narx qatori bazada yaratilishi MUMKIN EMAS.
 *
 * `tx`: chaqiruvchi ochiq tranzaksiya klientini uzatishi mumkin.
 *
 * ── ⚠ NEGA `TeacherSalaryService` `forwardRef` BILAN ──
 *
 * Bog'liqlik HAQIQATAN aylanma: `TeacherSalaryModule` `FinanceModule` ni
 * import qiladi (`StudentPaymentService`, `FinancialTransactionService`),
 * bu servis esa narx o'zgarganda o'qituvchining FOIZ maoshini qayta
 * hisoblashi kerak. Express'da aylana ESM ko'tarilishi bilan jimgina
 * yopiladi; NestJS'da `forwardRef` — o'sha narsaning OCHIQ ifodasi.
 *
 * ⚠ MANTIQ NUSXA KO'CHIRILMADI: maosh hisoblash dvigateli BITTA joyda
 * (`TeacherSalaryService`). Ikkinchi nusxa vaqt o'tib ajralib ketardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class GroupFeeService {
  private readonly logger = new Logger('GroupFeeService');

  constructor(
    // ⚠ `@Inject` SHART: `PrismaService` — SINF EMAS, TOKEN
    // (`prisma.module.ts` da `useFactory`). Metadata'da `Object` bo'lib
    // chiqadi va `@Inject` siz DI uni topa olmaydi.
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly payments: StudentPaymentService,
    private readonly prices: CoursePriceService,
    @Inject(forwardRef(() => TeacherSalaryService))
    private readonly salaries: TeacherSalaryService,
    private readonly approvals: ExpenseApprovalsService,
  ) {}

  private db(tx?: any): any {
    return tx || this.prisma;
  }

  /** Express `actorId(u) = u?.id || u?._id || null` — ikkala taxallus. */
  private actorId(u: any): string | null {
    return u?.id || u?._id || null;
  }

  private feeKey(groupId: string, year: number, month: number) {
    return { groupId_year_month: { groupId: String(groupId), year, month } };
  }

  /** O'tgan oy tarifi (carry-forward uchun). */
  private async prevMonthAmount(
    group: string, year: number, month: number, tx?: any,
  ): Promise<number> {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prev = await this.db(tx).groupFee.findUnique({
      where: this.feeKey(group, prevYear, prevMonth),
      select: { amount: true },
    });
    return prev ? Number(prev.amount) : 0;
  }

  /**
   * KURS NARXIDAN MEROS.
   *
   * Guruhda o'tgan oy tarifi bo'lmasa (yangi guruh yoki birinchi oy),
   * KURS narxiga tushamiz: bazaviy narx yoki filial istisnosi.
   *
   * ⚠ XATO YUTILADI: narx topilmasa 0 qaytadi va guruh avvalgidek
   * "tarifi belgilanmagan" holatda qoladi. Kurs narxi tufayli `GroupFee`
   * yaratilmay qolishi ancha yomonroq bo'lardi.
   */
  private async inheritedCourseAmount(
    group: string, year: number, month: number,
  ): Promise<number> {
    try {
      const resolved = await this.prices.resolveGroupPrice(group, { year, month });
      // GROUP_FEE manbasini QAYTA ishlatmaymiz — biz aynan shu yozuvni
      // yaratmoqchimiz, ya'ni u hali yo'q. Faqat KATALOG narxi kerak.
      if (resolved?.amount && resolved.source !== PRICE_SOURCES.GROUP_FEE) {
        return Number(resolved.amount);
      }
    } catch (err) {
      this.logger.warn(
        `Kurs narxini meros qilib bo'lmadi (guruh ${group}): ${(err as Error).message}`,
      );
    }
    return 0;
  }

  /**
   * Guruh+oy uchun to'lov yozuvi mavjudligini TA'MINLAYDI (carry-forward
   * bilan). `tx` berilsa ochiq tranzaksiya ichida o'qib-yozadi.
   */
  async ensureGroupFee(
    group: string, year: number, month: number, { tx }: { tx?: any } = {},
  ) {
    const client = this.db(tx);
    const groupId = String(group);

    const existing = await client.groupFee.findUnique({
      where: this.feeKey(groupId, year, month),
    });
    if (existing) return withLegacyId(existing);

    // MEROS TARTIBI: o'tgan oy tarifi → KURS narxi → 0.
    //
    // O'tgan oy USTUN: guruhga qo'lda qo'yilgan narx katalog narxidan
    // muhimroq (u aniq bu guruh uchun qabul qilingan qaror).
    let amount = await this.prevMonthAmount(groupId, year, month, tx);
    if (!amount) amount = await this.inheritedCourseAmount(groupId, year, month);

    try {
      // `update: {}` — Mongo'dagi `$setOnInsert` ning aynan ekvivalenti:
      // qator allaqachon bo'lsa HECH NARSA o'zgartirilmaydi (qo'lda
      // qo'yilgan narx avtomatik meros bilan bosib ketilmasin).
      const row = await client.groupFee.upsert({
        where: this.feeKey(groupId, year, month),
        create: { groupId, year, month, amount, source: 'auto' },
        update: {},
      });
      return withLegacyId(row);
    } catch (err: any) {
      // POYGA: ikki jarayon bir vaqtda yaratmoqchi bo'ldi.
      if (err?.code === 'P2002') {
        const again = await client.groupFee.findUnique({
          where: this.feeKey(groupId, year, month),
        });
        return again ? withLegacyId(again) : null;
      }
      throw err;
    }
  }

  /**
   * Guruhning berilgan oyga ENG YAQIN mavjud tarifi.
   *
   * O'sha oyda yoki undan OLDINGI eng yaqin tarif (o'sha vaqtda amalda
   * bo'lgan narx); topilmasa eng erta mavjud tarif. Hech narsa bo'lmasa 0.
   *
   * ⚠ Kelajakdagi (oshirilgan) tarif o'tmishga TATBIQ QILINMAYDI — aks
   * holda o'quvchi o'sha vaqtdagidan ortiq qarzdor bo'lardi.
   *
   * EKSPORT: `previewBackdate` shu funksiyani ishlatadi — u FAQAT O'QIYDI,
   * shuning uchun "bu amal qancha qarz yaratadi?" savoliga yon ta'sirsiz
   * javob berish uchun aynan mos.
   */
  async nearestFeeAmount(group: string, year: number, month: number): Promise<number> {
    const idx = year * 12 + (month - 1);
    const fees = await this.prisma.groupFee.findMany({
      where: { groupId: String(group) },
      select: { year: true, month: true, amount: true },
    });
    if (!fees.length) return 0;
    let priorBest: { idx: number; amount: number } | null = null;
    let earliest: { idx: number; amount: number } | null = null;
    for (const f of fees) {
      const fIdx = f.year * 12 + (f.month - 1);
      const amount = Number(f.amount);
      if (fIdx <= idx) {
        if (!priorBest || fIdx > priorBest.idx) priorBest = { idx: fIdx, amount };
      } else if (!earliest || fIdx < earliest.idx) {
        earliest = { idx: fIdx, amount };
      }
    }
    if (priorBest) return priorBest.amount;
    return earliest ? earliest.amount : 0;
  }

  /**
   * Berilgan oy uchun `GroupFee` mavjudligini ta'minlaydi; bo'lmasa ENG
   * YAQIN mavjud tarif summasi bilan yaratadi (carry-forward emas —
   * o'tmishga BACKFILL).
   */
  async ensureGroupFeeBackfill(group: string, year: number, month: number) {
    const groupId = String(group);
    const existing = await this.prisma.groupFee.findUnique({
      where: this.feeKey(groupId, year, month),
    });
    if (existing) return withLegacyId(existing);

    const amount = await this.nearestFeeAmount(groupId, year, month);
    try {
      const row = await this.prisma.groupFee.upsert({
        where: this.feeKey(groupId, year, month),
        create: { groupId, year, month, amount, source: 'auto' },
        update: {},
      });
      return withLegacyId(row);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const again = await this.prisma.groupFee.findUnique({
          where: this.feeKey(groupId, year, month),
        });
        return again ? withLegacyId(again) : null;
      }
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // O'QISH
  // ══════════════════════════════════════════════════════════════════

  /** Tanlangan oy uchun barcha faol guruhlar + o'sha oy tarifi (jadval). */
  async list({ year, month, search }: { year: number; month: number; search?: string }) {
    // FILIAL: guruhlar filtrlansa, ularning narxlari ham avtomatik
    // cheklanadi (fees quyida aynan shu guruh ID'lari bo'yicha olinadi).
    const where: any = { ...branchFilter(), isActive: true, isDeleted: false };
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }
    const groups = await this.prisma.group.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const fees = groups.length
      ? await this.prisma.groupFee.findMany({
          where: {
            groupId: { in: groups.map((g) => g.id) },
            year: Number(year),
            month: Number(month),
          },
        })
      : [];
    const byGroup = new Map(fees.map((f) => [String(f.groupId), f]));

    return groups.map((g) => {
      const fee: any = byGroup.get(String(g.id));
      return {
        // Klient `row.group._id` o'qiydi — moslik saqlanadi.
        group: { id: g.id, _id: g.id, name: g.name },
        year: Number(year),
        month: Number(month),
        feeId: fee ? fee.id : null,
        amount: fee ? fee.amount : null,
        source: fee ? fee.source : null,
      };
    });
  }

  /** Bitta guruhning barcha oylik tariflari. Joriy oyni TA'MINLAYDI. */
  async byGroup(groupId: string) {
    // FILIAL: boshqa filial guruhining narx tarixi ochilmasin.
    const group = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      select: { id: true, name: true },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');

    const today = localTodayMidnight();
    await this.ensureGroupFee(
      group.id, today.getUTCFullYear(), today.getUTCMonth() + 1,
    );

    const fees = await this.prisma.groupFee.findMany({
      where: { groupId: group.id },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return {
      group: { id: group.id, _id: group.id, name: group.name },
      fees: withLegacyIds(fees),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // YOZISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * Guruh+oy tarifini o'rnatadi (upsert). Narx faqat shu (yil, oy) ga
   * ta'sir qiladi — qo'shimcha sana yo'q. O'chirish yo'q.
   *
   * ⚠ O'QUVCHI QAYTA HISOBI BEST-EFFORT EMAS: narx o'zgardi-yu, o'quvchi
   * qarzi eski summada qolsa — kirim hisoboti YOLG'ON bo'lardi. Xato
   * yuqoriga qaytadi va chaqiruvchi 500 oladi.
   *
   * O'qituvchi maoshi esa best-effort (Express bilan bir xil).
   */
  async upsert(
    { groupId, year, month, amount }:
      { groupId: string; year: number; month: number; amount: number },
    currentUser?: any,
  ) {
    // FILIAL: bu YOZUV amali — boshqa filial guruhining narxini
    // o'zgartirish butun o'quvchi to'lovlari va o'qituvchi maoshini
    // qayta hisoblardi.
    const group = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      select: {
        id: true, name: true, isActive: true, isDeleted: true, endDate: true,
      },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');
    assertGroupActive(group);

    const by = this.actorId(currentUser);
    const fee = await this.prisma.groupFee.upsert({
      where: this.feeKey(group.id, year, month),
      create: {
        groupId: group.id, year, month, amount: amount as never,
        source: 'manual', createdById: by, updatedById: by,
      },
      update: { amount: amount as never, source: 'manual', updatedById: by },
    });

    // Avval o'quvchilar (billed manbai), keyin o'qituvchi foiz maoshi.
    await this.payments.recalcForGroupMonth(group.id, year, month);
    try {
      await this.salaries.recalcForGroupMonth(group.id, year, month);
    } catch (err) {
      this.logger.warn(
        "Guruh to'lovi o'zgarishida o'qituvchi maoshi qayta hisoblanmadi: " +
          (err as Error).message,
      );
    }
    return withLegacyId(fee);
  }

  // ══════════════════════════════════════════════════════════════════
  // GURUH NARXI TASDIG'I
  //
  // NEGA CHEGIRMA BILAN BIR QATORDA: guruh oylik narxini 1 000 000 dan
  // 400 000 ga tushirish — barcha o'quvchiga 60% chegirma berish bilan
  // IQTISODIY JIHATDAN BIR XIL. Faqat chegirmani tasdiqqa qo'yish "old
  // eshikni qulflab, yon eshikni ochiq qoldirish" bo'lardi.
  //
  // TASDIQLANMAGUNCHA `GroupFee` O'ZGARMAYDI: uning `amount` maydoni
  // snapshot'dagi `baseFee` — ya'ni yozilishi bilanoq barcha o'quvchining
  // expected summasi qayta hisoblanardi.
  // ══════════════════════════════════════════════════════════════════

  /**
   * Guruh narxini TASDIQQA yuboradi (yozmaydi).
   *
   * Yengil tekshiruv: guruh mavjud va joriy filial ko'lamida ekanligi.
   * To'liq qoidalar tasdiqlash paytida qayta ishlaydi.
   */
  async requestGroupFee(
    { groupId, year, month, amount, requestNote }: {
      groupId: string; year: number; month: number;
      amount: number; requestNote?: string;
    },
    currentUser?: any,
  ) {
    // Filial ko'lami so'rov paytida ham tekshiriladi — direktor boshqa
    // filial guruhiga so'rov yubora olmasin.
    const group = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      select: {
        id: true, name: true, branchId: true,
        isActive: true, isDeleted: true, endDate: true,
      },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');
    assertGroupActive(group);

    // Owner "qanchadan qanchaga" ekanini ko'rishi uchun eski narx snapshot'i.
    const existing = await this.prisma.groupFee.findUnique({
      where: this.feeKey(group.id, year, month),
      select: { amount: true },
    });

    return this.approvals.createRequest({
      branchId: group.branchId,
      kind: APPROVAL_KINDS.GROUP_FEE_SET,
      payload: {
        groupId: String(group.id),
        year,
        month,
        amount,
        previousAmount: existing ? existing.amount : null,
      },
      // Bitta guruh-oy uchun bitta kutilayotgan so'rov.
      subjectKey: `group_fee:${String(group.id)}:${year}:${month}`,
      subjectName: group.name || '',
      contextName: `${month}/${year}`,
      requestNote,
      currentUser,
    });
  }

  /**
   * Tasdiqlangan guruh narxi so'rovini BAJARADI.
   *
   * `upsert()` NING O'ZINI chaqiradi — guruh aktivligi tekshiruvi va ikki
   * bosqichli qayta hisoblash shu yerda qayta ishlaydi.
   *
   * ⚠ FILIAL KONTEKSTI MAJBURAN o'rnatiladi: `upsert()` ichida
   * `branchFilter()` bor, u esa TASDIQLOVCHINING joriy ko'rinishiga
   * bog'liq. Owner "Toshkent" filialini tanlab turib Buxoro guruhining
   * so'rovini tasdiqlasa, guruh topilmay so'rov bekorga FAILED bo'lardi.
   * So'rovning O'Z filiali — yagona to'g'ri kontekst.
   */
  async executeApprovedGroupFee(approval: any) {
    const p = approval?.payload || {};
    const branchId = String(approval.branchId);
    const requesterId = approval?.requestedById || approval?.requestedBy || null;

    return runWithBranchContext(
      {
        branchId,
        allowedBranchIds: [branchId],
        canSeeAllBranches: false,
        userId: String(requesterId || ''),
      },
      () =>
        this.upsert(
          { groupId: p.groupId, year: p.year, month: p.month, amount: p.amount },
          { id: requesterId, _id: requesterId },
        ),
    );
  }

  /**
   * Berilgan oy uchun barcha faol guruhlarga tarif yozuvini ta'minlaydi
   * (carry-forward). Oylik jobdan chaqiriladi.
   */
  async generateMonth(year: number, month: number) {
    const groups = await this.prisma.group.findMany({
      where: { isActive: true, isDeleted: false },
      select: { id: true },
    });
    let created = 0;
    for (const g of groups) {
      // eslint-disable-next-line no-await-in-loop
      const existed = await this.prisma.groupFee.findUnique({
        where: this.feeKey(g.id, year, month),
        select: { id: true },
      });
      if (existed) continue;
      // eslint-disable-next-line no-await-in-loop
      await this.ensureGroupFee(g.id, year, month);
      created += 1;
    }
    return { groups: groups.length, created };
  }
}
