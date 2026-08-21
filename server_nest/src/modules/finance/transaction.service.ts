import { randomBytes } from 'node:crypto';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { assertGroupActive } from '../../common/helpers/group-state.js';
import { parseLocalDay, localTodayMidnight } from '../../common/utils/date.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import { StudentPaymentService } from './student-payment.service.js';
import { FinancialTransactionService } from './financial-transaction.service.js';
import { DepositsService } from '../deposits/deposits.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI TO'LOVI (KIRIM) — Express
 * `finance/services/transaction.service.js` NING KO'CHIRMASI.
 *
 * To'lov qabul qiladi va tanlangan oydan ORTGAN summani avtomatik ravishda
 * shu o'quvchining keyingi qoldiq oylariga (ENG ESKISIDAN) taqsimlaydi —
 * har oy uchun alohida yozuv, BITTA `batchId` bilan (bekor qilishda birga
 * void). Barcha qarz yopilgach ortgan pul GAROV sifatida depozitga tushadi.
 *
 * ⚠ `DepositsService` `forwardRef` bilan: `DepositsModule` `FinanceModule`
 * ni import qiladi (`applyPaidDelta`, jurnal), bu servis esa ortiqcha
 * to'lovni depozitga o'tkazishi kerak — bog'liqlik HAQIQATAN aylanma.
 * Express aynan shu joyda modul yuklanishida aylanani ESM ko'tarilishi
 * bilan yopadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Bir martada qabul qilinadigan maksimal summa (kassa xatosini cheklash). */
const MAX_PAYMENT_AMOUNT = 50_000_000;

/**
 * BATCH KALITI. Mongo'da `new ObjectId()` KLIENT tomonida yaratilardi va
 * hech qaysi jadvalga tegishli emas edi — u shunchaki bitta to'lovning
 * bo'laklarini bog'lab turadigan noyob belgi. `batchId` ustuni
 * `VarChar(24)`, shuning uchun bir xil shakldagi 24-belgili hex yaratamiz.
 */
const gen24Hex = (): string => randomBytes(12).toString('hex');

@Injectable()
export class TransactionService {
  constructor(
    // ⚠ `@Inject` SHART — `PrismaService` token (qarang `prisma.module.ts`).
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly payments: StudentPaymentService,
    private readonly financialTx: FinancialTransactionService,
    @Inject(forwardRef(() => DepositsService))
    private readonly deposits: DepositsService,
  ) {}

  private actorId(u: any): string | null {
    return u?.id || u?._id || null;
  }

  /** Idempotentlik dublikati — takror so'rovni "yangi pul emas" deb qaytaradi. */
  private duplicateResult(existing: unknown) {
    return { allocated: 0, duplicate: true, transactions: existing ? [existing] : [] };
  }

  /**
   * To'lovni taqsimlash TARTIBI: avval TANLANGAN oy, keyin shu o'quvchining
   * shu guruhdagi boshqa qoldiq oylari (ENG ESKISIDAN).
   *
   * ⚠ Tanlangan oy to'liq to'langan bo'lsa ham ro'yxatda QOLADI (loop
   * ichida 0 ulush bilan o'tib ketiladi) — Express bilan aynan bir xil.
   */
  private async buildAllocationOrder(selected: any, tx: any = null): Promise<any[]> {
    const others = await (tx || this.prisma).studentPayment.findMany({
      where: {
        studentId: selected.studentId,
        groupId: selected.groupId,
        id: { not: selected.id },
        writtenOff: false,
        // Ustunni ustunga solishtirish — Mongo `$expr` ekvivalenti.
        expectedAmount: { gt: this.prisma.studentPayment.fields.paidAmount },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }, { createdAt: 'asc' }],
    });
    return [selected, ...others];
  }

  async create(
    { paymentId, amount, method, paidAt, note, idempotencyKey }: {
      paymentId: string; amount: number; method: string;
      paidAt?: string; note?: string; idempotencyKey?: string;
    },
    currentUser?: any,
  ) {
    // FILIAL: boshqa filial o'quvchisiga to'lov yozib bo'lmaydi.
    const payment = await this.prisma.studentPayment.findFirst({
      where: { id: String(paymentId), ...branchFilter() },
    });
    if (!payment) throw new ApiError(404, "To'lov topilmadi");

    // Arxivlangan guruhga to'lov qabul qilinmaydi.
    assertGroupActive(
      await this.prisma.group.findUnique({
        where: { id: payment.groupId },
        select: { id: true, isActive: true, isDeleted: true, endDate: true },
      }),
    );

    const total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) {
      throw new ApiError(400, "Summa noto'g'ri");
    }
    if (total > MAX_PAYMENT_AMOUNT) {
      throw new ApiError(400, "Bir martada 50 000 000 so'mdan ko'p kiritib bo'lmaydi");
    }

    const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
    if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");
    // Kelajak sanaga kirim yozib bo'lmaydi (kassa kunlik hisobi buzilmasin).
    if (day.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "To'lov sanasi kelajakda bo'lishi mumkin emas");
    }

    if (idempotencyKey) {
      const existing = await this.prisma.paymentTransaction.findFirst({
        where: { idempotencyKey },
      });
      if (existing) return this.duplicateResult(withLegacyId(existing));
    }

    // ══════════════════════════════════════════════════════════════
    // BUTUN SO'ROV — BITTA TRANZAKSIYA
    //
    // Ilgari har ULUSH alohida tranzaksiyada edi, ortiqcha pulni
    // depozitga o'tkazish esa yana boshqasida. Ya'ni so'rov "1-ulush
    // kommit, 2-ulush kommit, depozit XATO, so'rov XATO" holatida
    // tugashi MUMKIN edi: foydalanuvchi "to'lov o'tmadi" javobini olib,
    // qayta urardi va pul IKKI MARTA tushardi.
    //
    // ⚠ `deposits.topup` GA `tx` UZATILADI: Prisma'da ichma-ich
    // interaktiv tranzaksiya yo'q — u o'zi ochsa ALOHIDA ulanishda
    // ochilardi va tashqi rollback unga ta'sir qilmasdi (aynan
    // yopmoqchi bo'lgan tuynuk), ustiga ikkalasi bir xil depozit
    // qatorini qulflab, o'zini-o'zi bloklab qo'yardi.
    // ══════════════════════════════════════════════════════════════
    const batchId = gen24Hex();
    let outcome: { transactions: any[]; depositCredited: number };
    try {
      outcome = await this.prisma.$transaction(async (tx: any) => {
        // Taqsimlash tartibi TRANZAKSIYA ICHIDA o'qiladi — barcha
        // qatorlar bitta izchil suratdan olinadi.
        const order = await this.buildAllocationOrder(payment, tx);
        const transactions: any[] = [];
        let left = total;
        // Idempotency kaliti faqat BATCH'ning BIRINCHI yozuviga biriktiriladi.
        let pendingKey: string | null = idempotencyKey || null;

        for (const plan of order) {
          if (left <= 0) break;
          // Yomon qarz (write-off) yopilgan — to'lov unga taqsimlanmaydi.
          if (plan.writtenOff) continue;
          const remaining = Math.max(
            0, (Number(plan.expectedAmount) || 0) - (Number(plan.paidAmount) || 0),
          );
          const take = Math.min(left, remaining);
          if (take <= 0) continue;

          // Balans SHARTLI-ATOMIK oshiriladi. `null` → parallel so'rov shu
          // oyni allaqachon yopgan; keyingi oyga o'tamiz.
          // eslint-disable-next-line no-await-in-loop
          const updated = await this.payments.applyPaidDelta(plan.id, take, {
            capToRemaining: true,
            tx,
          });
          if (!updated) continue;

          // eslint-disable-next-line no-await-in-loop
          const created = await tx.paymentTransaction.create({
            data: {
              // FILIAL: oylik plandan meros (plan guruhdan olgan).
              branchId: plan.branchId,
              paymentId: plan.id,
              studentId: plan.studentId,
              groupId: plan.groupId,
              year: plan.year,
              month: plan.month,
              amount: take,
              source: 'direct',
              method,
              paidAt: day,
              note: note || '',
              idempotencyKey: pendingKey,
              batchId,
              createdById: this.actorId(currentUser),
            },
          });

          // JURNAL + AUDIT + o'lchovlar — markaziy servis orqali.
          // eslint-disable-next-line no-await-in-loop
          await this.financialTx.postStudentPayment(
            { paymentTransactionId: created.id },
            currentUser,
            { tx },
          );

          transactions.push(created);
          pendingKey = null;
          left -= take;
        }

        // Barcha qarzdan ortgan summa GAROV bo'lib depozitga tushadi
        // (`topup` → `autoApply` boshqa guruhlardagi qoldiqni ham eng
        // eskisidan qoplaydi, qolgani balansda qoladi).
        let depositCredited = 0;
        if (left > 0) {
          await this.deposits.topup(
            payment.studentId,
            {
              amount: left, method, paidAt,
              note: note || "Ortiqcha to'lov - garovga",
            },
            currentUser,
            { tx },
          );
          depositCredited = left;
        }

        return { transactions, depositCredited };
      }, FINANCE_TXN_OPTIONS);
    } catch (err: any) {
      // Parallel takror so'rov qisman unique idempotency indeksga urildi.
      if (err?.code === 'P2002' && idempotencyKey) {
        const existing = await this.prisma.paymentTransaction.findFirst({
          where: { idempotencyKey },
        });
        if (existing) return this.duplicateResult(withLegacyId(existing));
      }
      throw err;
    }

    const { transactions, depositCredited } = outcome;

    return {
      allocated: transactions.length,
      transactions: withLegacyIds(transactions),
      depositCredited,
    };
  }

  /**
   * Tranzaksiyani BEKOR qiladi (soft-delete), balansni atomik kamaytiradi.
   *
   * Avansli to'lov (batch) bo'lsa — BUTUN batch birga void bo'ladi: bitta
   * bo'lakni o'chirib kelgusi oylarda "fantom avans" qoldirib bo'lmaydi.
   *
   * ⚠ Butun void BITTA tranzaksiyada. Aks holda yarmida xato bo'lsa
   * tranzaksiya o'chirilgan (`isDeleted=true`), lekin `paidAmount`
   * qaytarilmay qolardi — kassadan pul chiqqani holda yozuv "to'langan"
   * ko'rinib, audit izsiz pul yo'qolardi.
   */
  async remove(id: string, currentUser?: any) {
    return this.prisma.$transaction(async (tx: any) => {
      // FILIAL: boshqa filial to'lovini bekor qilib bo'lmaydi. Bu amal
      // depozitga pul qaytaradi, ya'ni haqiqiy moliyaviy ta'sirga ega.
      const trx = await tx.paymentTransaction.findFirst({
        where: { id: String(id), ...branchFilter(), isDeleted: false },
      });
      if (!trx) throw new ApiError(404, 'Tranzaksiya topilmadi');

      const batch = trx.batchId
        ? await tx.paymentTransaction.findMany({
            where: { batchId: trx.batchId, isDeleted: false },
          })
        : [trx];

      const removed: string[] = [];
      for (const t of batch) {
        // eslint-disable-next-line no-await-in-loop
        await tx.paymentTransaction.update({
          where: { id: t.id },
          data: {
            isDeleted: true, deletedAt: new Date(),
            deletedBy: this.actorId(currentUser),
          },
        });
        // eslint-disable-next-line no-await-in-loop
        await this.payments.applyPaidDelta(t.paymentId, -Number(t.amount), { tx });

        // ── YOMON QARZ TUZATISHI ──
        //
        // `writeOffAmount` write-off PAYTIDAGI qoldiq bilan muzlatiladi
        // (expected − paid). Shu oyning to'lovi keyin bekor qilinsa,
        // haqiqiy yo'qotish o'sha summaga OSHADI, lekin `writeOffAmount`
        // eski qiymatda qolib ketardi — natijada bekor qilingan summa
        // hech qayerda ko'rinmay, JIMGINA yo'qolardi.
        // eslint-disable-next-line no-await-in-loop
        const paymentDoc = await tx.studentPayment.findUnique({
          where: { id: t.paymentId },
          select: { writtenOff: true },
        });
        if (paymentDoc?.writtenOff) {
          // eslint-disable-next-line no-await-in-loop
          await tx.studentPayment.update({
            where: { id: t.paymentId },
            data: { writeOffAmount: { increment: t.amount } },
          });
        }

        // Depozitdan qoplangan to'lov bekor qilinsa — pul DEPOZITGA
        // qaytadi (naqdga emas). Void bilan bir xil tranzaksiyada —
        // tashqi abort'da double-credit bo'lmasin.
        if (t.source === 'deposit') {
          // eslint-disable-next-line no-await-in-loop
          await this.deposits.refundToDeposit(t.studentId, Number(t.amount), { tx });
        }
        removed.push(t.id);
      }
      return { id: trx.id, _id: trx.id, removed };
    }, FINANCE_TXN_OPTIONS);
  }
}
