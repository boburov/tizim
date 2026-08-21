import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { isBranchAllowed } from '../../common/als/branch-context.js';
import { parseLocalDay, localTodayMidnight } from '../../common/utils/date.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import { FinancialTransactionService } from '../finance/financial-transaction.service.js';
import type { TxClient } from '../journal/journal.service.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * MOLIYAVIY AMALLAR — HTTP yuzasi
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu modul FAQAT yuzani beradi va BOSHQA HECH NARSA QILMAYDI:
 *   • buxgalteriya mantig'i YO'Q — hammasi `financialTransaction` da
 *   • hisob-kitob YO'Q
 *   • yangi jadval YO'Q
 *
 * ── IDEMPOTENTLIK ──
 * Har amal `idempotencyKey` qabul qiladi (klient forma ochilganda bir
 * marta yaratadi). U `postingKey` ga aylanadi va DB darajasidagi unique
 * indeks takroriy yozuvni to'sadi — "Yuborish" tugmasi ikki marta
 * bosilsa ham pul ikki marta harakatlanmaydi.
 *
 * Kalit berilmasa server o'zi yaratadi. Bu ATAYLAB ruxsat etilgan
 * (skript va integratsiya uchun), lekin UI HAR DOIM o'zi yuboradi —
 * aks holda tarmoq uzilib qayta urinilganda himoya yo'qolardi.
 */

interface Actor {
  id?: string | null;
  _id?: string | null;
  homeBranchId?: string | null;
}

const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;
const genKey = () => randomBytes(12).toString('hex');

const resolveDay = (value?: string): Date => {
  const day = value ? parseLocalDay(value) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Sana noto'g'ri");
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Sana kelajakda bo'lishi mumkin emas");
  }
  return day;
};

@Injectable()
export class FinanceOpsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly financialTx: FinancialTransactionService,
  ) {}

  /**
   * ⚠⚠ EXPRESS'DAGI XATO ATAYLAB TAKRORLANADI — PARITET UCHUN.
   *
   * Express `financeOps.service.js` shunday yozgan:
   *
   *     if (!isBranchAllowed(currentUser, branchId)) throw 403
   *
   * lekin yordamchining imzosi BITTA argument oladi:
   *
   *     export const isBranchAllowed = (branchId) => { ... }
   *
   * Ya'ni `currentUser` `branchId` O'RNIGA tushadi va `branchId`
   * umuman E'TIBORGA OLINMAYDI. Natijada tekshiruv shunday ishlaydi:
   *   • `String(userObject)` = "[object Object]" — hech qaysi filial
   *     ID siga mos kelmaydi;
   *   • demak FAQAT `canSeeAllBranches` (owner) o'tadi.
   *
   * ── O'LCHANDI (ishlab turgan Express, 5000-port) ──
   *   filial DIREKTORI, O'Z filiali  → 403 "Bu filialda amal bajarib
   *                                        bo'lmaydi"
   *   OWNER, o'sha filial            → 201 (musbat nazorat)
   *
   * Ya'ni `/finance-ops` ning uchala yozish amali (qaytarim, o'tkazma,
   * egasining puli) filial direktorlari uchun AMALDA YOPIQ.
   *
   * ── NEGA TUZATILMADI ──
   * Bu FAIL-CLOSED nuqson: u ruxsat BERMAYDI, ortiqcha ruxsat bermaydi —
   * xavfsizlik teshigi EMAS. Trafik hozircha Express'da, ya'ni uni
   * NestJS tomonda "tuzatish" ikki stekni AJRATIB yuborardi: bir xil
   * so'rov 403 va 201 qaytarardi. Paritet — shartnoma, shuning uchun
   * xatti-harakat AYNAN ko'chirildi va yuqori qatlamga XABAR QILINDI.
   *
   * Tuzatilganda `resolveBranchForWrite` allaqachon ko'lamni
   * majburlaydi (u yuqorida chaqiriladi va begona filialga 403 beradi),
   * ya'ni bu qator ortiqcha bo'lib qoladi.
   */
  private assertBranchOpAllowed(currentUser?: Actor | null): void {
    // Argument ATAYLAB `currentUser` — Express bilan bir xil bo'lishi
    // uchun. Tur tizimi buni to'g'ri deb hisoblamaydi, shuning uchun
    // ochiq kast.
    if (!isBranchAllowed(currentUser as unknown as string)) {
      throw new ApiError(403, "Bu filialda amal bajarib bo'lmaydi");
    }
  }

  /**
   * QAYTARIM: hujjat yaratiladi va DARHOL bajariladi — bitta
   * tranzaksiyada.
   *
   * NEGA IKKALASI BIRGA: "yaratildi, lekin bajarilmadi" holatidagi
   * qaytarim hech kimga foyda bermaydi — pul kassada turaveradi,
   * hujjat esa hisobotda "kutilmoqda" bo'lib osilib qoladi. Tasdiq
   * zanjiri kerak bo'lsa u `Approval` orqali qo'shiladi (mavjud
   * mexanizm), bu yerda emas.
   *
   * Summa tekshiruvi (`qaytarim <= to'langan`) `postRefund` ichida —
   * takrorlanmaydi.
   */
  async createRefund(
    body: {
      studentId: string; groupId?: string; originalTransactionId?: string;
      amount: number; method?: string; reason?: string; date?: string;
      idempotencyKey?: string;
    },
    currentUser?: Actor | null,
  ) {
    const student = await this.prisma.user.findFirst({
      where: { id: String(body.studentId), role: 'student', isDeleted: false },
      select: { id: true, homeBranchId: true },
    });
    if (!student) throw new ApiError(404, "O'quvchi topilmadi");

    // FILIAL: o'quvchining filiali; ko'lam tekshiriladi.
    const branchId = await this.branchAccess.resolveBranchForWrite(
      currentUser, student.homeBranchId);
    if (!branchId) throw new ApiError(400, "Filial aniqlanmadi");

    let groupId: string | null = body.groupId || null;
    let membershipId: string | null = null;
    if (body.originalTransactionId) {
      const orig = await this.prisma.paymentTransaction.findUnique({
        where: { id: String(body.originalTransactionId) },
        select: {
          id: true, studentId: true, groupId: true, isDeleted: true, paymentId: true,
        },
      });
      if (!orig || orig.isDeleted) throw new ApiError(404, "Asl to'lov topilmadi");
      if (String(orig.studentId) !== String(student.id)) {
        throw new ApiError(400, "Asl to'lov boshqa o'quvchiga tegishli");
      }
      groupId = groupId || orig.groupId;
      const plan = await this.prisma.studentPayment.findUnique({
        where: { id: orig.paymentId }, select: { membershipId: true },
      });
      membershipId = plan?.membershipId || null;
    }

    return this.prisma.$transaction(async (t) => {
      const tx = t as unknown as TxClient;
      const refund = await tx.refund.create({
        data: {
          branchId,
          studentId: student.id,
          groupId,
          membershipId,
          originalTransactionId: body.originalTransactionId || null,
          amount: Math.round(Number(body.amount)),
          method: (body.method || 'cash') as never,
          reason: body.reason || '',
          requestedById: actorId(currentUser),
          createdById: actorId(currentUser),
          approvedById: actorId(currentUser),
          approvedAt: new Date(),
          executedAt: resolveDay(body.date),
        } as never,
      });
      await this.financialTx.postRefund({ refundId: refund.id }, currentUser, { tx });
      return withLegacyId(await tx.refund.findUnique({ where: { id: refund.id } }));
    }, FINANCE_TXN_OPTIONS);
  }

  /** ICHKI O'TKAZMA — bitta filial ichida hisobdan hisobga. */
  async createTransfer(
    body: {
      branchId?: string; fromMethod: string; toMethod: string; amount: number;
      memo?: string; date?: string; idempotencyKey?: string;
    },
    currentUser?: Actor | null,
  ) {
    const branchId = await this.branchAccess.resolveBranchForWrite(
      currentUser, body.branchId ?? null);
    if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
    this.assertBranchOpAllowed(currentUser);

    const res = await this.financialTx.postTransfer(
      {
        branchId,
        fromMethod: body.fromMethod,
        toMethod: body.toMethod,
        amount: Math.round(Number(body.amount)),
        reference: body.idempotencyKey || genKey(),
        date: resolveDay(body.date),
        memo: body.memo || '',
      },
      currentUser,
    );
    return { entryId: res.entry?.id || null, duplicate: Boolean(res.duplicate) };
  }

  /**
   * EGASINING PULI — investitsiya yoki yechib olish.
   *
   * Yagona kirish nuqtasi: yo'nalish `direction` maydonida. Ikki
   * alohida endpoint o'rniga bitta — ular AYNAN bir xil
   * tekshiruvlardan o'tadi va faqat yozuv yo'nalishi bilan farq
   * qiladi.
   */
  async createOwnerCapital(
    body: {
      direction: string; branchId?: string; amount: number; method?: string;
      memo?: string; date?: string; idempotencyKey?: string;
    },
    currentUser?: Actor | null,
  ) {
    const branchId = await this.branchAccess.resolveBranchForWrite(
      currentUser, body.branchId ?? null);
    if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
    this.assertBranchOpAllowed(currentUser);

    const args = {
      branchId,
      amount: Math.round(Number(body.amount)),
      method: body.method || 'cash',
      reference: body.idempotencyKey || genKey(),
      date: resolveDay(body.date),
      memo: body.memo || '',
      ownerId: actorId(currentUser),
    };

    const res = body.direction === 'withdrawal'
      ? await this.financialTx.postOwnerWithdrawal(args, currentUser)
      : await this.financialTx.postOwnerInvestment(args, currentUser);

    return {
      direction: body.direction,
      entryId: res.entry?.id || null,
      duplicate: Boolean(res.duplicate),
    };
  }
}
