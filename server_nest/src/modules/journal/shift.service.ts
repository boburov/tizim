import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SHIFT_STATUSES } from '../../common/constants/treasury.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { ACCOUNT_KINDS, ENTRY_KINDS } from '../../common/constants/ledger.js';
import { branchFilter, isBranchAllowed } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { JournalService, type TxClient } from './journal.service.js';

// ─────────────────────────────────────────────────────────────────────
// NEGA BU MODUL `financialTransaction.service.js` NI ISHLATMAYDI
//
// Smena yopilishidagi farq (kamomad/ortiqcha) markaziy servisdagi
// amallarning hech biriga to'g'ri kelmaydi: u to'lov ham, chiqim ham
// emas — SANOQ natijasi va `shortage` hisobiga tushadi.
//
// Ikki marta yopilishning oldini shartli `updateMany` (WHERE status =
// 'open') oladi. Qarang FINANCE-ARCHITECTURE.md, "STEP 4 ilovasi".
// ─────────────────────────────────────────────────────────────────────

// KASSA SMENASI - ochish, yopish, sanoq.
//
// ── SMENA NEGA KERAK ──
// Naqd pul - yagona "yo'qolishi mumkin" bo'lgan aktiv. Terminal va Click
// summasi bank tomonidan tasdiqlanadi, naqd esa faqat SANOQ bilan.
// Smena yopilmasa, "qancha bo'lishi kerak edi" degan savolga
// solishtiradigan nuqta bo'lmaydi va kamomad oylab sezilmay qoladi.

interface Actor {
  id?: string | null;
  _id?: string | null;
  homeBranchId?: string | null;
}

const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

@Injectable()
export class ShiftService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** Kassirning ochiq smenasi (bo'lmasa null). */
  findOpen(branchId: string, cashierId: string) {
    return this.prisma.shift.findFirst({
      where: {
        branchId: String(branchId),
        cashierId: String(cashierId),
        status: SHIFT_STATUSES.OPEN as never,
      },
    });
  }

  /**
   * SMENA OCHISH.
   *
   * `openingCash` QO'LDA kiritilmaydi - jurnaldagi joriy naqd qoldiq
   * olinadi. Aks holda kassir smena boshida istagan raqamni yozib,
   * yopilishdagi farqni yashira olardi.
   */
  async open(
    { cashierId, note }: { cashierId?: string; note?: string },
    currentUser?: Actor | null,
  ) {
    const branchId = await this.branchAccess.resolveBranchForWrite(currentUser, null);
    const cashier = cashierId || actorId(currentUser);
    if (!cashier) throw new ApiError(400, "Kassir aniqlanmadi");

    const existing = await this.findOpen(branchId, cashier);
    if (existing) {
      throw new ApiError(409, "Bu kassirning ochiq smenasi allaqachon bor");
    }

    const openingCash = await this.journal.accountBalance(
      branchId,
      ACCOUNT_KINDS.CASH,
    );

    try {
      return withLegacyId(
        await this.prisma.shift.create({
          data: {
            branchId: String(branchId),
            cashierId: String(cashier),
            openedAt: new Date(),
            openedById: actorId(currentUser),
            // Manfiy qoldiq (nazariy jihatdan bo'lmasligi kerak) nolga
            // keltiriladi - manfiy ochilish summasi keyingi hisoblarni
            // chalkashtirardi.
            openingCash: Math.max(0, openingCash),
            status: SHIFT_STATUSES.OPEN as never,
            varianceNote: note || '',
          },
        }),
      );
    } catch (err) {
      // QISMAN UNIQUE: (branchId, cashierId) WHERE status = 'open'.
      // Yuqoridagi `findOpen` tekshiruvi bilan poyga bo'lsa indeks
      // ushlaydi - bu ikkinchi qatlam, birinchisining o'rniga emas.
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ApiError(409, "Bu kassirning ochiq smenasi allaqachon bor");
      }
      throw err;
    }
  }

  /**
   * SMENA YOPISH - sanoq va farqni jurnalga yozish.
   *
   * ── FARQ QANDAY YOZILADI ──
   * KAMOMAD (sanoq < kutilgan): naqd hisobi kamayadi, `shortage` hisobi
   * o'sadi. Bu XARAJAT EMAS - alohida hisob, chunki u yo'qotish va mas'ul
   * shaxsga bog'lanadi (constants/ledger.js).
   *
   * ORTIQCHA (sanoq > kutilgan): naqd o'sadi, qarshi tomon `shortage`
   * hisobining teskarisi - ya'ni oldingi kamomad qoplanadi yoki ortiqcha
   * qayd etiladi. Ortiqcha ham xato belgisi: u odatda yozilmagan to'lov
   * yoki noto'g'ri qaytim demakdir.
   *
   * FARQ NOL bo'lsa jurnalga HECH NARSA yozilmaydi - bo'sh yozuv shovqin.
   */
  async close(
    shiftId: string,
    { countedCash, note }: { countedCash: number; note?: string },
    currentUser?: Actor | null,
  ) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: String(shiftId) },
    });
    if (!shift) throw new ApiError(404, "Smena topilmadi");
    if (!isBranchAllowed(shift.branchId)) {
      throw new ApiError(403, "Bu smenaga kirish huquqingiz yo'q");
    }
    if (shift.status !== SHIFT_STATUSES.OPEN) {
      throw new ApiError(409, "Smena allaqachon yopilgan");
    }

    const counted = Math.round(Number(countedCash));
    if (!Number.isFinite(counted) || counted < 0) {
      throw new ApiError(400, "Sanalgan summa manfiy bo'lmagan son bo'lishi kerak");
    }

    const closedAt = new Date();

    // KUTILGAN SUMMA - jurnaldan. Smena davridagi harakat emas, JORIY
    // qoldiq olinadi: kassada hozir qancha pul turishi kerakligini
    // aynan shu ko'rsatadi.
    const expected = await this.journal.accountBalance(
      shift.branchId,
      ACCOUNT_KINDS.CASH,
    );
    const variance = counted - expected;

    // HOLAT VA JURNAL BITTA TRANZAKSIYADA, holat AVVAL.
    //
    // `updateMany` shart bilan (`status: OPEN`) - ikki bir vaqtdagi
    // yopish IKKI marta kamomad yozardi. Ilgari bu "o'qi, tekshir,
    // yoz" edi va ikkinchi so'rov birinchisining natijasini ko'rmasdi.
    const saved = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.shift.updateMany({
        where: { id: shift.id, status: SHIFT_STATUSES.OPEN as never },
        data: {
          closedAt,
          closedById: actorId(currentUser),
          expectedCash: expected,
          countedCash: counted,
          variance,
          ...(note ? { varianceNote: note } : {}),
          status: SHIFT_STATUSES.CLOSED as never,
        },
      });
      if (!count) throw new ApiError(409, "Smena allaqachon yopilgan");

      if (variance !== 0) {
        const isShortage = variance < 0;
        const amount = Math.abs(variance);

        await this.journal.post({
          branchId: shift.branchId,
          date: closedAt,
          kind: ENTRY_KINDS.SHIFT_CLOSE,
          memo: isShortage
            ? `Smena yopilishi: kamomad ${amount}`
            : `Smena yopilishi: ortiqcha ${amount}`,
          lines: isShortage
            ? [
                { accountKind: ACCOUNT_KINDS.SHORTAGE, debit: amount },
                { accountKind: ACCOUNT_KINDS.CASH, credit: amount },
              ]
            : [
                { accountKind: ACCOUNT_KINDS.CASH, debit: amount },
                { accountKind: ACCOUNT_KINDS.SHORTAGE, credit: amount },
              ],
          refModel: 'Shift',
          refId: shift.id,
          createdBy: actorId(currentUser),
          tx: tx as unknown as TxClient,
        });
      }

      return tx.shift.findUnique({ where: { id: shift.id } });
    });

    return withLegacyId(saved);
  }

  /** Smenalar ro'yxati - filial ko'lami bilan. */
  async list({
    status,
    cashierId,
    page = 1,
    limit = 50,
  }: {
    status?: string;
    cashierId?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const where: Record<string, unknown> = { ...branchFilter() };
    if (status) where.status = status;
    if (cashierId) where.cashierId = String(cashierId);

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.shift.findMany({
        where: where as never,
        orderBy: { openedAt: 'desc' },
        skip,
        take: limit,
        include: {
          cashier: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
          branch: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.shift.count({ where: where as never }),
    ]);

    // Klient eski populate shaklini kutadi (`s.cashierId?.firstName`).
    return {
      items: withLegacyIds(
        items.map((r) => ({
          ...r,
          cashierId: r.cashier || r.cashierId,
          branchId: r.branch || r.branchId,
        })),
      ),
      total,
      page,
      limit,
    };
  }
}
