import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { soum } from '../../common/utils/money.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import {
  ACCOUNT_KINDS,
  ENTRY_KINDS,
  METHOD_TO_ACCOUNT,
} from '../../common/constants/ledger.js';
import {
  JournalService,
  type JournalLineInput,
  type TxClient,
} from '../journal/journal.service.js';
import { DimensionResolverService, type Dimensions } from './dimension-resolver.service.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * MOLIYAVIY TRANZAKSIYA SERVISI — pul yozishning YAGONA nuqtasi
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu servis `helpers/journalPosting.helper.js` NING O'RNINI EGALLAYDI.
 * Har bir modul (chiqim, maosh, to'lov, depozit) o'zicha jurnal yozish
 * o'rniga shu yerdagi ANIQ NOMLI amalni chaqiradi.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ESKI YONDASHUVDAN UCHTA TUB FARQ
 * ─────────────────────────────────────────────────────────────────────
 *
 * 1) ATOMIK. Ilgari jurnalga yozish xatosi YUTILARDI (safePost →
 *    logger.error → davom et). Mantiq shunday edi: "pul allaqachon
 *    qo'ldan qo'lga o'tgan, to'lovni rad etish yomonroq".
 *
 *    ENDI: operatsion yozuv va jurnal BITTA tranzaksiyada. Xato bo'lsa
 *    IKKALASI ham qaytariladi.
 *
 *    NEGA FIKR O'ZGARDI: yutilgan xato "yarim yozilgan pul" holatini
 *    yaratardi — PaymentTransaction bor, jurnalda yo'q. Bu holat
 *    JIMGINA va uni faqat `journalVerify` keyinroq topardi (agar
 *    kimdir ishga tushirsa). Atomik variantda esa eng yomon natija —
 *    "hech narsa yozilmadi", ya'ni kassir xatoni DARHOL ko'radi va
 *    qayta uradi. Ko'rinadigan nosozlik ko'rinmas nomuvofiqlikdan
 *    yaxshiroq.
 *
 *    `journal-verify.service.ts` ZAXIRA sifatida QOLADI — tashqaridan
 *    (SQL, migratsiya, eski skript) yozilgan qatorlar uchun.
 *
 * 2) IDEMPOTENT. Har bir amalning `postingKey` i bor
 *    ("payment:<id>", "expense:<id>"...) va u DB darajasida unique.
 *    Takroriy urinish pulni IKKI MARTA yoza olmaydi. Bu servis
 *    mantiqiga emas, INDEKSGA tayanadi.
 *
 * 3) O'LCHOVLI. Har yozuv manba hujjatdan aniqlangan o'lchovlar bilan
 *    yoziladi (qarang dimension-resolver.service.ts). Chaqiruvchi
 *    ularni YUBORMAYDI — ya'ni bir-biriga mos kelmaydigan to'plam
 *    yuborish imkoniyati YO'Q.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BU SERVIS NIMA QILMAYDI
 * ─────────────────────────────────────────────────────────────────────
 *  • Tahlil/hisobot HISOBLAMAYDI. Yozish va o'qish alohida masala.
 *  • RUXSAT tekshirmaydi. Ruxsat marshrut qatlamida (`@Permissions`) —
 *    bu servis HTTP yuzasi emas va faqat tekshiruvdan o'tgan servislar
 *    chaqiradi.
 *  • Maosh/chegirma FORMULASINI hisoblamaydi. U o'z modulida qoladi;
 *    bu yer faqat NATIJANI buxgalteriya tiliga o'giradi.
 */

interface Actor {
  id?: string | null;
  _id?: string | null;
  firstName?: string;
  lastName?: string;
  username?: string;
  $ip?: string;
  $userAgent?: string;
}

const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;
const actorName = (u?: Actor | null): string =>
  [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.username || '';

export interface AuditInput {
  entityType: string;
  entityId: string;
  action: string;
  amountBefore?: number | null;
  amountAfter?: number | null;
  reason?: string;
  changedFields?: string[];
  oldValue?: unknown;
  newValue?: unknown;
  meta?: Record<string, unknown>;
}

export interface PostResult {
  entry: { id: string } | null;
  duplicate: boolean;
  skipped?: string;
}

@Injectable()
export class FinancialTransactionService {
  private readonly logger = new Logger('FinancialTransaction');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly dim: DimensionResolverService,
  ) {}

  /**
   * `tx` berilgan bo'lsa unga qo'shiladi, aks holda o'zi ochadi.
   *
   * ⚠ CHEGARALAR `common/utils/finance-txn.ts` DAN — Express
   * `financeTxn.helper.js` bilan AYNAN bir xil qiymat (maxWait 10s,
   * timeout 60s). Prisma standarti (2s/5s) moliya uchun juda qisqa:
   * o'quvchini butunlay o'chirish 12 jadvalga tegadi va katta guruhda
   * 5 soniyaga sig'masligi mumkin — o'shanda tranzaksiya yarim yo'lda
   * uzilardi.
   */
  private withTxn<T>(
    tx: TxClient | null | undefined,
    work: (t: TxClient) => Promise<T>,
  ): Promise<T> {
    if (tx) return work(tx);
    return this.prisma.$transaction(
      (t) => work(t as unknown as TxClient),
      FINANCE_TXN_OPTIONS,
    ) as Promise<T>;
  }

  /** To'lov kanalidan hisob turini aniqlaydi (noma'lum bo'lsa - naqd). */
  accountForMethod(method?: string | null): string {
    return (
      METHOD_TO_ACCOUNT[String(method || 'cash').toLowerCase()] ||
      ACCOUNT_KINDS.CASH
    );
  }

  /**
   * ══════════════════════════════════════════════════════════════════
   * TO'LOV SUMMALARINING YAGONA FORMULASI (Faza 12)
   * ══════════════════════════════════════════════════════════════════
   *
   *   brutto (gross) — o'quvchi TO'LAGAN summa. Uning qarzi shunga
   *                    kamayadi va DAROMAD aynan shu.
   *   komissiya (fee)— provayder ushlab qolgan ulush. Bu XARAJAT.
   *   netto (net)    — kassaga HAQIQATDA tushgan pul.
   *
   *   net = gross − fee
   *
   * Uchalasi ham kerak va ular BOSHQA savolga javob beradi. Bitta raqam
   * bilan ishlaganda ular jimgina aralashardi: brutto yozilsa kassa
   * qoldig'i komissiya miqdoricha oshib ketardi, netto yozilsa
   * o'quvchida o'sha miqdorda "qarz" qolib ketardi.
   *
   * BU FORMULA FAQAT SHU YERDA. Har joyda qayta yozilsa, ular MUQARRAR
   * ajralib ketadi.
   */
  computePaymentAmounts({
    amount,
    feeAmount = 0,
  }: { amount: unknown; feeAmount?: unknown }) {
    const gross = soum(amount);
    const fee = soum(feeAmount || 0);
    if (gross <= 0) throw new ApiError(400, "To'lov summasi musbat bo'lishi kerak");
    if (fee < 0) throw new ApiError(400, "Komissiya manfiy bo'lishi mumkin emas");
    // Komissiya to'lovdan katta bo'lsa — netto manfiy bo'lardi, ya'ni
    // "pul qabul qilib, kassadan pul chiqdi". Bu ma'lumot xatosi.
    if (fee > gross) {
      throw new ApiError(400, "Komissiya to'lov summasidan katta bo'lishi mumkin emas");
    }
    return { gross, fee, net: gross - fee };
  }

  /**
   * MOLIYAVIY AUDIT YOZUVI.
   *
   * Jurnal "pul qayerga ketdi" ni aytadi, audit esa "kim, qachon va
   * NEGA qildi" ni. Ikkinchisisiz raqamni tushuntirib bo'lmaydi.
   *
   * Jurnal yozuvi bilan BIR TRANZAKSIYADA — audit izsiz pul harakati
   * bo'lishi mumkin emas.
   */
  private async writeAudit(
    tx: TxClient,
    {
      entityType, entityId, action, branchId, actor,
      amountBefore = null, amountAfter = null, reason = '', changedFields = [],
      oldValue = null, newValue = null, meta = {},
    }: AuditInput & { branchId?: string | null; actor?: Actor | null },
  ) {
    await tx.financialAuditLog.create({
      data: {
        entityType,
        entityId: String(entityId),
        action: action as never,
        branchId: branchId ? String(branchId) : null,
        actorId: actorId(actor),
        actorLabel: actorName(actor),
        amountBefore,
        amountAfter,
        reason,
        changedFields,
        oldValue: oldValue as never,
        newValue: (newValue ?? (Object.keys(meta).length ? meta : null)) as never,
        ip: actor?.$ip || '',
        userAgent: actor?.$userAgent || '',
      } as never,
    });
  }

  /**
   * YOZISHNING UMUMIY YADROSI.
   *
   * Ketma-ketlik HAMMA amal uchun bir xil ("centralized dimension
   * resolution"):
   *   1. o'lchovlar shu tur uchun mumkinmi        (assertApplicable)
   *   2. filial bilan zid emasmi                  (assertBranchConsistency)
   *   3. idempotent yozish                        (postIdempotent)
   *   4. audit                                     (writeAudit)
   */
  private async postCore(
    tx: TxClient,
    {
      branchId, kind, date, memo, lines, refModel, refId, postingKey,
      dimensions, isInternal = false, counterpartyBranchId = null, actor,
      audit,
    }: {
      branchId: string;
      kind: string;
      date?: Date;
      memo?: string;
      lines: JournalLineInput[];
      refModel?: string | null;
      refId?: string | null;
      postingKey: string;
      dimensions?: Dimensions | null;
      isInternal?: boolean;
      counterpartyBranchId?: string | null;
      actor?: Actor | null;
      audit?: AuditInput;
    },
  ): Promise<PostResult> {
    const dims = this.dim.assertApplicable(kind, dimensions || {});
    await this.dim.assertBranchConsistency(branchId, dims, tx);

    const { entry, duplicate } = await this.journal.postIdempotent({
      branchId, date, kind, memo, lines,
      refModel, refId, postingKey, dimensions: dims,
      isInternal, counterpartyBranchId,
      createdBy: actorId(actor),
      tx,
    });

    // TAKRORIY urinishda audit YOZILMAYDI: amal aslida bajarilmadi,
    // uni "yana bir marta qilindi" deb yozish audit izini yolg'on
    // qilardi.
    if (!duplicate && audit) {
      await this.writeAudit(tx, { ...audit, branchId, actor });
    }

    return { entry: entry as { id: string }, duplicate };
  }

  // ══════════════════════════════════════════════════════════════════
  // 1. O'QUVCHI TO'LOVI
  // ══════════════════════════════════════════════════════════════════

  /**
   * O'QUVCHI TO'LOVINI JURNALGA YOZADI.
   *
   * Kirish — FAQAT tranzaksiya ID si. Summa, filial, guruh, davr va
   * kanal MANBA HUJJATDAN o'qiladi ("Prefer source-of-truth IDs over
   * caller-provided monetary facts").
   *
   * YOZUV (komissiyasiz):
   *   Debet  <kanal hisobi>  700 000
   *   Kredit daromad         700 000
   *
   * YOZUV (komissiya bilan — Faza 12):
   *   Debet  <kanal hisobi>  693 000   ← kassaga HAQIQATDA tushgan
   *   Debet  payment_fee       7 000   ← provayder ushlagani (xarajat)
   *   Kredit daromad         700 000   ← o'quvchi to'lagani (daromad)
   *
   * Komissiya AYNAN SHU yozuv ichida — ALOHIDA yozuv sifatida EMAS.
   * Alohida bo'lsa daromad ikki marta kamayishi yoki kassa ikki marta
   * o'zgarishi mumkin edi.
   *
   * DEPOZITDAN QOPLANGAN to'lov (`source: "deposit"`) BU YERGA
   * KELMAYDI — u pul harakati emas, depozitdan daromadga ko'chirish
   * (postDepositApply).
   */
  postStudentPayment(
    { paymentTransactionId }: { paymentTransactionId: string },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      const trx = await t.paymentTransaction.findUnique({
        where: { id: String(paymentTransactionId) },
      });
      if (!trx) throw new ApiError(404, "To'lov tranzaksiyasi topilmadi");
      if (trx.isDeleted) {
        throw new ApiError(400, "Bekor qilingan to'lovni yozib bo'lmaydi");
      }
      if (trx.source === 'deposit') {
        throw new ApiError(
          400,
          "Depozitdan qoplangan to'lov postDepositApply orqali yoziladi",
        );
      }

      const { gross, fee, net } = this.computePaymentAmounts(
        trx as unknown as { amount: unknown; feeAmount?: unknown },
      );
      const lines: JournalLineInput[] = [
        { accountKind: this.accountForMethod(trx.method), debit: net },
      ];
      if (fee > 0) lines.push({ accountKind: ACCOUNT_KINDS.PAYMENT_FEE, debit: fee });
      lines.push({ accountKind: ACCOUNT_KINDS.REVENUE, credit: gross });

      return this.postCore(t, {
        branchId: trx.branchId,
        kind: ENTRY_KINDS.PAYMENT,
        date: trx.paidAt || trx.createdAt || new Date(),
        memo: trx.note || "O'quvchi to'lovi",
        lines,
        refModel: 'PaymentTransaction',
        refId: trx.id,
        postingKey: `payment:${trx.id}`,
        dimensions: await this.dim.fromPaymentTransaction(
          trx as unknown as Record<string, unknown>, t),
        actor,
        audit: {
          entityType: 'PaymentTransaction',
          entityId: trx.id,
          action: 'create',
          amountAfter: gross,
          reason: trx.note || '',
          newValue: { gross, fee, net, method: trx.method },
        },
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. DEPOZIT
  // ══════════════════════════════════════════════════════════════════

  /**
   * DEPOZITGA TO'LDIRISH — pul kirdi, lekin DAROMAD EMAS.
   *   Debet  <kanal>   ← kassaga tushdi
   *   Kredit depozit   ← o'quvchining puli (majburiyat)
   */
  postDepositTopup(
    { depositTransactionId }: { depositTransactionId: string },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      const txn = await t.depositTransaction.findUnique({
        where: { id: String(depositTransactionId) },
      });
      if (!txn) throw new ApiError(404, "Depozit tranzaksiyasi topilmadi");
      if (!txn.branchId) return { entry: null, duplicate: false, skipped: 'branchsiz' };
      const amount = soum(txn.amount);

      return this.postCore(t, {
        branchId: txn.branchId,
        kind: ENTRY_KINDS.DEPOSIT_IN,
        date: txn.paidAt || txn.createdAt || new Date(),
        memo: txn.note || "Depozitga to'ldirish",
        lines: [
          { accountKind: this.accountForMethod(txn.method), debit: amount },
          { accountKind: ACCOUNT_KINDS.DEPOSIT, credit: amount },
        ],
        refModel: 'DepositTransaction',
        refId: txn.id,
        postingKey: `deposit_in:${txn.id}`,
        dimensions: { studentId: txn.studentId, paymentMethod: txn.method },
        actor,
        audit: {
          entityType: 'DepositTransaction', entityId: txn.id,
          action: 'create', amountAfter: amount, reason: txn.note || '',
        },
      });
    });
  }

  /**
   * DEPOZITDAN QAYTARISH — majburiyat kamaydi, pul chiqdi.
   *   Debet  depozit
   *   Kredit <kanal>
   */
  postDepositWithdraw(
    { depositTransactionId }: { depositTransactionId: string },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      const txn = await t.depositTransaction.findUnique({
        where: { id: String(depositTransactionId) },
      });
      if (!txn) throw new ApiError(404, "Depozit tranzaksiyasi topilmadi");
      if (!txn.branchId) return { entry: null, duplicate: false, skipped: 'branchsiz' };
      const amount = soum(txn.amount);

      return this.postCore(t, {
        branchId: txn.branchId,
        kind: ENTRY_KINDS.DEPOSIT_OUT,
        date: txn.paidAt || txn.createdAt || new Date(),
        memo: txn.note || 'Depozitdan qaytarish',
        lines: [
          { accountKind: ACCOUNT_KINDS.DEPOSIT, debit: amount },
          { accountKind: this.accountForMethod(txn.method), credit: amount },
        ],
        refModel: 'DepositTransaction',
        refId: txn.id,
        postingKey: `deposit_out:${txn.id}`,
        dimensions: { studentId: txn.studentId, paymentMethod: txn.method },
        actor,
        audit: {
          entityType: 'DepositTransaction', entityId: txn.id,
          action: 'create', amountAfter: amount, reason: txn.note || '',
        },
      });
    });
  }

  /**
   * DEPOZITDAN OYLIKKA QOPLASH — PUL HARAKATI YO'Q.
   *   Debet  depozit  ← majburiyat kamaydi
   *   Kredit daromad  ← endi haqiqiy daromad
   *
   * Kassa qoldig'i O'ZGARMAYDI: pul allaqachon to'ldirish paytida
   * kirgan. Shuning uchun bu yerda birorta xazina hisobi qatnashmaydi.
   */
  postDepositApply(
    { paymentTransactionId }: { paymentTransactionId: string },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      const trx = await t.paymentTransaction.findUnique({
        where: { id: String(paymentTransactionId) },
      });
      if (!trx) throw new ApiError(404, "To'lov tranzaksiyasi topilmadi");
      const amount = soum(trx.amount);
      const dims = await this.dim.fromPaymentTransaction(
        trx as unknown as Record<string, unknown>, t);
      // Bu yozuvda kanal yo'q — pul harakatlanmadi.
      delete dims.paymentMethod;

      return this.postCore(t, {
        branchId: trx.branchId,
        kind: ENTRY_KINDS.DEPOSIT_APPLY,
        date: trx.paidAt || trx.createdAt || new Date(),
        memo: "Depozitdan oylik to'lovga qoplandi",
        lines: [
          { accountKind: ACCOUNT_KINDS.DEPOSIT, debit: amount },
          { accountKind: ACCOUNT_KINDS.REVENUE, credit: amount },
        ],
        refModel: 'PaymentTransaction',
        refId: trx.id,
        postingKey: `deposit_apply:${trx.id}`,
        dimensions: dims,
        actor,
        audit: {
          entityType: 'PaymentTransaction', entityId: trx.id,
          action: 'create', amountAfter: amount, reason: 'depozitdan qoplandi',
        },
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. CHIQIM
  // ══════════════════════════════════════════════════════════════════

  /**
   * CHIQIMNI JURNALGA YOZADI.
   *   Debet  xarajat
   *   Kredit <kanal hisobi>
   *
   * FILIALSIZ chiqim (markaz umumiy) JURNALGA YOZILMAYDI: jurnal
   * yozuvi doim bitta filialga tegishli bo'lishi shart. Bunday
   * chiqimlar `Expense.allocation` orqali taqsimlanadi va
   * konsolidatsiyalangan hisobotda ko'rinadi. Bu ATAYLAB — eski
   * xulq-atvor saqlanadi.
   */
  postExpense(
    { expenseId, revision = 0 }: { expenseId: string; revision?: number },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      const expense = await t.expense.findUnique({ where: { id: String(expenseId) } });
      if (!expense) throw new ApiError(404, 'Chiqim topilmadi');
      if (expense.isDeleted) {
        throw new ApiError(400, "O'chirilgan chiqimni yozib bo'lmaydi");
      }
      if (!expense.branchId) {
        return { entry: null, duplicate: false, skipped: 'filialsiz chiqim' };
      }
      const amount = soum(expense.amount);

      return this.postCore(t, {
        branchId: expense.branchId,
        kind: ENTRY_KINDS.EXPENSE,
        date: expense.spentAt || expense.createdAt || new Date(),
        memo: expense.title || 'Chiqim',
        lines: [
          { accountKind: ACCOUNT_KINDS.EXPENSE, debit: amount },
          { accountKind: this.accountForMethod(expense.method), credit: amount },
        ],
        refModel: 'Expense',
        refId: expense.id,
        // ── REVIZIYA (tahrirlash yo'li) ──
        // Chiqim tahrirlanganda eski yozuv STORNO qilinadi va YANGISI
        // yoziladi. Ikkalasi ham `refModel = "Expense"` bilan turadi,
        // ya'ni kalit BIR XIL bo'lsa ikkinchi yozuv unique indeksga
        // urilib butun tahrirni yiqitardi.
        //
        // `revision = 0` — birinchi yozuv, kalit O'ZGARMAYDI
        // (`expense:<id>`). Mavjud yozuvlar va `reverseByRef` ning
        // `storno:expense:<id>` kaliti shu tufayli joyida qoladi.
        postingKey:
          revision > 0
            ? `expense:${expense.id}:v${revision + 1}`
            : `expense:${expense.id}`,
        dimensions: await this.dim.fromExpense(
          expense as unknown as Record<string, unknown>, t),
        actor,
        audit: {
          entityType: 'Expense', entityId: expense.id,
          action: 'create', amountAfter: amount,
          reason: expense.description || expense.title || '',
          newValue: {
            amount, category: expense.categoryName, method: expense.method,
          },
        },
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 4. MAOSH (Faza 7)
  // ══════════════════════════════════════════════════════════════════
  //
  // MAOSH FORMULASI BU YERDA HISOBLANMAYDI. KPI va stavka mantiqi o'z
  // modulida qoladi (teacherSalary / staffPayroll) — bu yer faqat
  // NATIJANI buxgalteriya tiliga o'giradi.
  //
  // Maosh yozuvi "Maosh" chiqim KATEGORIYASIGA va davrga bog'lanadi.
  // Ilgari u nomsiz `expense` edi, ya'ni "chiqim kategoriyalari"
  // hisobotida markazning ENG KATTA xarajati umuman ko'rinmasdi va
  // byudjet/fakt taqqoslash maoshsiz qolardi.

  private postSalaryCommon(
    t: TxClient,
    {
      trx, refModel, keyPrefix, dimensions, memo, actor, entityType,
    }: {
      trx: Record<string, unknown> & { id: string; branchId?: string | null };
      refModel: string;
      keyPrefix: string;
      dimensions: Dimensions;
      memo: string;
      actor?: Actor | null;
      entityType: string;
    },
  ): Promise<PostResult> {
    if (!trx.branchId) {
      return Promise.resolve({ entry: null, duplicate: false, skipped: 'branchsiz' });
    }
    const amount = soum(trx.amount);
    return this.postCore(t, {
      branchId: trx.branchId,
      kind: ENTRY_KINDS.SALARY,
      date: (trx.paidAt as Date) || (trx.createdAt as Date) || new Date(),
      memo: (trx.note as string) || memo,
      lines: [
        { accountKind: ACCOUNT_KINDS.EXPENSE, debit: amount },
        { accountKind: this.accountForMethod(trx.method as string), credit: amount },
      ],
      refModel,
      refId: trx.id,
      postingKey: `${keyPrefix}:${trx.id}`,
      dimensions,
      actor,
      audit: {
        entityType, entityId: trx.id, action: 'create',
        amountAfter: amount, reason: (trx.note as string) || '',
        newValue: {
          amount, period: `${trx.year}-${trx.month}`, method: trx.method,
        },
      },
    });
  }

  /** O'QITUVCHI MAOSHI (SalaryTransaction). */
  postTeacherPayroll(
    { salaryTransactionId }: { salaryTransactionId: string },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      const trx = await t.salaryTransaction.findUnique({
        where: { id: String(salaryTransactionId) },
      });
      if (!trx) throw new ApiError(404, 'Maosh tranzaksiyasi topilmadi');
      return this.postSalaryCommon(t, {
        trx: trx as unknown as Record<string, unknown> & { id: string; branchId: string },
        refModel: 'SalaryTransaction',
        keyPrefix: 'salary_teacher',
        dimensions: await this.dim.fromTeacherSalaryTx(
          trx as unknown as Record<string, unknown>, t),
        memo: "O'qituvchi maoshi",
        entityType: 'SalaryTransaction',
        actor,
      });
    });
  }

  /**
   * ══════════════════════════════════════════════════════════════════
   * STORNO — BEKOR QILINGAN OPERATSIYANING JURNAL AKSI (B21)
   * ══════════════════════════════════════════════════════════════════
   *
   * ── MUAMMO (O'LCHANGAN) ──
   * To'lov/chiqim BEKOR QILINGANDA manba yozuv soft-delete bo'lardi va
   * `paidAmount` kamayardi, JURNAL esa TEGILMAY qolardi. Jurnal esa
   * P&L va kassa qoldig'ining MANBAI — ya'ni bekor qilingan har bir
   * to'lov hisobotda ABADIY chiqim bo'lib qolardi va kassa qoldig'i
   * o'sha summa qadar KAM ko'rsatardi.
   *
   * ── NEGA STORNO, QAYTARIM (`postRefund`) EMAS ──
   * Qaytarim — "to'lov BO'LGAN, keyin pul qaytarildi": ikkala harakat
   * ham tarixda ko'rinishi kerak. Bekor qilish esa "bu operatsiya
   * UMUMAN BO'LMAGAN" (xato kiritilgan).
   *
   * ── IDEMPOTENTLIK ──
   * `postingKey = "storno:<asl kalit>"`. Ikki marta bekor qilish
   * IKKINCHI storno YARATMAYDI — aks holda balans o'sha summa qadar
   * YOLG'ON o'sardi.
   *
   * ── ⚠ `null` XATO EMAS ──
   * Jurnal qatlami keyinroq qo'shilgan, ya'ni eski to'lovlarning jurnal
   * yozuvi umuman yo'q. Bunday holatda bekor qilish ISHLASHDA DAVOM
   * ETISHI kerak — aks holda eski yozuvni o'chirib bo'lmay qolardi.
   *
   * ── ⚠ ESKI MA'LUMOT ──
   * Bu ilgari bekor qilingan yozuvlarni O'ZI TUZATMAYDI. Ular uchun
   * alohida backfill kerak — u ONGLI qaror bo'lishi shart.
   */
  reverseByRef(
    { refModel, refId }: { refModel: string; refId: string },
    actor?: Actor | null,
    { tx, memo }: { tx?: TxClient | null; memo?: string } = {},
  ): Promise<unknown | null> {
    return this.withTxn(tx, async (t) => {
      // ⚠ `findMany`, `findFirst` EMAS: bitta hujjatga bir nechta yozuv
      // tegishli bo'lishi MUMKIN (masalan to'lov + komissiya). Faqat
      // birinchisini teskari aylantirish qolganini jurnalda QOLDIRARDI.
      const originals = await t.journalEntry.findMany({
        where: { refModel: String(refModel), refId: String(refId) },
        orderBy: { createdAt: 'asc' },
        select: { id: true, postingKey: true, memo: true },
      });
      if (!originals.length) return null;

      const createdBy = (actor as { id?: string; _id?: string })?.id
        || (actor as { id?: string; _id?: string })?._id || null;
      const out: unknown[] = [];
      for (const original of originals) {
        out.push(await this.journal.reverse(original.id, {
          memo: memo || `Storno: ${original.memo || refModel}`,
          createdBy,
          postingKey: `storno:${original.postingKey || original.id}`,
          tx: t,
        }));
      }
      return out;
    });
  }

  /** XODIM MAOSHI (StaffSalaryTransaction). */
  postStaffPayroll(
    { staffSalaryTransactionId }: { staffSalaryTransactionId: string },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      const trx = await t.staffSalaryTransaction.findUnique({
        where: { id: String(staffSalaryTransactionId) },
      });
      if (!trx) throw new ApiError(404, 'Maosh tranzaksiyasi topilmadi');
      return this.postSalaryCommon(t, {
        trx: trx as unknown as Record<string, unknown> & { id: string; branchId: string | null },
        refModel: 'StaffSalaryTransaction',
        keyPrefix: 'salary_staff',
        dimensions: await this.dim.fromStaffSalaryTx(
          trx as unknown as Record<string, unknown>, t),
        memo: 'Xodim maoshi',
        entityType: 'StaffSalaryTransaction',
        actor,
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 5. QAYTARIM (Faza 6)
  // ══════════════════════════════════════════════════════════════════

  /**
   * QAYTARIMNI BAJARADI VA JURNALGA YOZADI.
   *
   *   Debet  daromad   ← daromad kamaydi
   *   Kredit <kanal>   ← kassadan pul chiqdi
   *
   * ── NEGA `reverse()` (STORNO) EMAS ──
   * Storno — XATO yozuvni bekor qilish uchun: "bu operatsiya umuman
   * bo'lmagan". Qaytarim esa BOSHQA narsa: to'lov HAQIQATAN bo'lgan,
   * pul kassada TURGAN, keyin qaytarilgan. Ikkalasi ham tarixda
   * ko'rinishi kerak ("Financial history must contain both
   * operations").
   *
   * Storno ishlatilsa asl to'lov jurnaldan "yo'qolgandek" bo'lardi va
   * "shu oyda qancha tushum bo'ldi?" degan savol noto'g'ri javob
   * berardi.
   */
  postRefund(
    { refundId }: { refundId: string },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      const refund = await t.refund.findUnique({ where: { id: String(refundId) } });
      if (!refund) throw new ApiError(404, 'Qaytarim topilmadi');
      if (refund.isDeleted) throw new ApiError(400, "O'chirilgan qaytarim");
      if (refund.status === 'rejected' || refund.status === 'canceled') {
        throw new ApiError(400, "Rad etilgan qaytarimni bajarib bo'lmaydi");
      }
      const amount = soum(refund.amount);
      if (amount <= 0) throw new ApiError(400, "Qaytarim summasi musbat bo'lishi kerak");

      // ── QAYTARIM ASL TO'LOVDAN OSHMASLIGI KERAK ──
      // Aks holda markaz olmagan pulini qaytarardi. Tekshiruv shu
      // yerda, chunki bu YAGONA yo'l: UI dagi tekshiruv chetlab
      // o'tilishi mumkin.
      if (refund.originalTransactionId) {
        const orig = await t.paymentTransaction.findUnique({
          where: { id: refund.originalTransactionId },
          select: { amount: true, isDeleted: true },
        });
        if (!orig || orig.isDeleted) {
          throw new ApiError(400, "Asl to'lov topilmadi yoki bekor qilingan");
        }
        // Shu to'lov bo'yicha AVVAL qaytarilganlar ham hisobga olinadi.
        const prior = await t.refund.aggregate({
          where: {
            originalTransactionId: refund.originalTransactionId,
            id: { not: refund.id },
            status: 'executed',
            isDeleted: false,
          },
          _sum: { amount: true },
        });
        const already = soum(prior._sum.amount || 0);
        if (already + amount > soum(orig.amount)) {
          throw new ApiError(
            400,
            `Qaytarim to'langan summadan oshib ketdi (to'langan ${soum(orig.amount)}, avval qaytarilgan ${already})`,
          );
        }
      }

      const result = await this.postCore(t, {
        branchId: refund.branchId,
        kind: ENTRY_KINDS.REFUND,
        date: refund.executedAt || new Date(),
        memo: refund.reason || 'Qaytarim',
        lines: [
          { accountKind: ACCOUNT_KINDS.REVENUE, debit: amount },
          { accountKind: this.accountForMethod(refund.method), credit: amount },
        ],
        refModel: 'Refund',
        refId: refund.id,
        postingKey: `refund:${refund.id}`,
        dimensions: await this.dim.fromRefund(
          refund as unknown as Record<string, unknown>, t),
        actor,
        audit: {
          entityType: 'Refund', entityId: refund.id, action: 'execute',
          amountAfter: amount, reason: refund.reason || '',
          newValue: {
            amount, method: refund.method, original: refund.originalTransactionId,
          },
        },
      });

      // Holatni faqat HAQIQATAN yozilganda o'zgartiramiz.
      if (!result.duplicate) {
        await t.refund.update({
          where: { id: refund.id },
          data: {
            status: 'executed' as never,
            executedAt: refund.executedAt || new Date(),
            journalEntryId: result.entry!.id,
          },
        });
      }
      return result;
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 6. ALOHIDA TO'LOV KOMISSIYASI (Faza 12)
  // ══════════════════════════════════════════════════════════════════

  /**
   * TO'LOVGA BOG'LANMAGAN komissiya — masalan bankning oylik xizmat
   * haqi yoki provayderning davriy hisob-kitobi.
   *
   *   Debet  payment_fee
   *   Kredit <kanal hisobi>
   *
   * DIQQAT: bitta TO'LOVGA tegishli komissiya BU YERDA yozilmaydi — u
   * `postStudentPayment` yozuvi ICHIDA (aks holda daromad ikki marta
   * kamayardi yoki kassa ikki marta o'zgarardi).
   */
  postPaymentFee(
    {
      branchId, amount, method = 'bank', reference, date, memo, provider = '',
    }: {
      branchId?: string | null; amount: unknown; method?: string;
      reference?: string; date?: Date; memo?: string; provider?: string;
    },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
      if (!reference) {
        throw new ApiError(400, "Komissiya uchun `reference` shart (idempotentlik)");
      }
      const value = soum(amount);
      if (value <= 0) throw new ApiError(400, "Summa musbat bo'lishi kerak");

      return this.postCore(t, {
        branchId,
        kind: ENTRY_KINDS.PAYMENT_FEE,
        date: date || new Date(),
        memo: memo || `To'lov tizimi komissiyasi${provider ? ` (${provider})` : ''}`,
        lines: [
          { accountKind: ACCOUNT_KINDS.PAYMENT_FEE, debit: value },
          { accountKind: this.accountForMethod(method), credit: value },
        ],
        refModel: 'PaymentFee',
        refId: null,
        postingKey: `payment_fee:${reference}`,
        dimensions: { paymentMethod: method, costType: 'variable' },
        actor,
        audit: {
          entityType: 'PaymentFee', entityId: String(reference),
          action: 'create', amountAfter: value, reason: memo || provider,
        },
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 7. EGASINING PULI (Faza 13)
  // ══════════════════════════════════════════════════════════════════

  /**
   * EGASI PUL QO'SHDI.
   *   Debet  <kanal hisobi>   ← kassa oshdi
   *   Kredit owner_capital    ← markaz egasiga "qarzdor"
   *
   * DAROMAD EMAS. Egasi 20 mln qo'shsa kassa oshadi, lekin markaz hech
   * narsa SOTMAGAN. Daromad deb yozilsa "foyda" yolg'on ko'tarilib,
   * eng muhim savol — "biznes O'ZI pul topayaptimi?" — javobsiz
   * qolardi. Buni ta'minlaydigan qoida: `constants/ledger.ts` →
   * NON_OPERATING_ENTRY_KINDS.
   */
  postOwnerInvestment(
    {
      branchId, amount, method = 'cash', reference, date, memo, ownerId,
    }: {
      branchId?: string | null; amount: unknown; method?: string;
      reference?: string; date?: Date; memo?: string; ownerId?: string | null;
    },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
      if (!reference) throw new ApiError(400, "`reference` shart (idempotentlik)");
      const value = soum(amount);
      if (value <= 0) throw new ApiError(400, "Summa musbat bo'lishi kerak");

      return this.postCore(t, {
        branchId,
        kind: ENTRY_KINDS.OWNER_INVESTMENT,
        date: date || new Date(),
        memo: memo || "Egasining investitsiyasi",
        lines: [
          { accountKind: this.accountForMethod(method), debit: value },
          { accountKind: ACCOUNT_KINDS.OWNER_CAPITAL, credit: value },
        ],
        refModel: 'OwnerCapital',
        refId: ownerId ? String(ownerId) : null,
        postingKey: `owner_investment:${reference}`,
        dimensions: { staffId: ownerId || null, paymentMethod: method },
        actor,
        audit: {
          entityType: 'OwnerCapital', entityId: String(reference),
          action: 'create', amountAfter: value, reason: memo || 'investitsiya',
          newValue: { direction: 'investment', amount: value, method },
        },
      });
    });
  }

  /**
   * EGASI PUL YECHDI.
   *   Debet  owner_capital   ← markazning egasiga majburiyati kamaydi
   *   Kredit <kanal hisobi>  ← kassa kamaydi
   *
   * XARAJAT EMAS — aks holda egasi pul yechgan oyda markaz "zarar
   * ko'rgandek" ko'rinardi.
   */
  postOwnerWithdrawal(
    {
      branchId, amount, method = 'cash', reference, date, memo, ownerId,
    }: {
      branchId?: string | null; amount: unknown; method?: string;
      reference?: string; date?: Date; memo?: string; ownerId?: string | null;
    },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
      if (!reference) throw new ApiError(400, "`reference` shart (idempotentlik)");
      const value = soum(amount);
      if (value <= 0) throw new ApiError(400, "Summa musbat bo'lishi kerak");

      return this.postCore(t, {
        branchId,
        kind: ENTRY_KINDS.OWNER_WITHDRAWAL,
        date: date || new Date(),
        memo: memo || "Egasining yechib olishi",
        lines: [
          { accountKind: ACCOUNT_KINDS.OWNER_CAPITAL, debit: value },
          { accountKind: this.accountForMethod(method), credit: value },
        ],
        refModel: 'OwnerCapital',
        refId: ownerId ? String(ownerId) : null,
        postingKey: `owner_withdrawal:${reference}`,
        dimensions: { staffId: ownerId || null, paymentMethod: method },
        actor,
        audit: {
          entityType: 'OwnerCapital', entityId: String(reference),
          action: 'create', amountAfter: value, reason: memo || 'yechib olish',
          newValue: { direction: 'withdrawal', amount: value, method },
        },
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 8. ICHKI O'TKAZMA (Faza 3)
  // ══════════════════════════════════════════════════════════════════

  /**
   * BITTA FILIAL ICHIDA HISOBDAN HISOBGA (bank → kassa, click → bank).
   *   Debet  <qabul qiluvchi hisob>
   *   Kredit <jo'natuvchi hisob>
   *
   * NA DAROMAD, NA XARAJAT — pul markaz ichida ko'chdi. Ikkala qator
   * ham xazina hisobi, ya'ni umumiy qoldiq O'ZGARMAYDI, faqat
   * taqsimoti o'zgaradi.
   *
   * FILIALLARARO inkassatsiya BU EMAS — u `cash-transfer.service.ts`
   * da (yo'ldagi pul, ikki filial jurnali, due_from/due_to).
   */
  postTransfer(
    {
      branchId, fromMethod, toMethod, amount, reference, date, memo,
    }: {
      branchId?: string | null; fromMethod?: string; toMethod?: string;
      amount: unknown; reference?: string; date?: Date; memo?: string;
    },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
      if (!reference) throw new ApiError(400, "`reference` shart (idempotentlik)");
      const from = this.accountForMethod(fromMethod);
      const to = this.accountForMethod(toMethod);
      if (from === to) {
        throw new ApiError(
          400,
          "Jo'natuvchi va qabul qiluvchi hisob bir xil bo'lmasligi kerak",
        );
      }
      const value = soum(amount);
      if (value <= 0) throw new ApiError(400, "Summa musbat bo'lishi kerak");

      return this.postCore(t, {
        branchId,
        kind: ENTRY_KINDS.ACCOUNT_TRANSFER,
        date: date || new Date(),
        memo: memo || `Ichki o'tkazma: ${from} → ${to}`,
        lines: [
          { accountKind: to, debit: value },
          { accountKind: from, credit: value },
        ],
        refModel: 'AccountTransfer',
        refId: null,
        postingKey: `account_transfer:${reference}`,
        // Sun'iy o'lchov YO'Q: pul hech kimga tegishli emas, markaz
        // ichida ko'chdi.
        dimensions: {},
        actor,
        audit: {
          entityType: 'AccountTransfer', entityId: String(reference),
          action: 'create', amountAfter: value,
          reason: memo || '', newValue: { from, to, amount: value },
        },
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 9. QO'LDA TUZATISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * QO'LDA TUZATISH — eng kuchli va eng xavfli amal.
   *
   * `lines` ochiq beriladi (tuzatish har qanday shaklda bo'lishi
   * mumkin), lekin muvozanat baribir `post()` da tekshiriladi va
   * `reason` MAJBURIY: sababsiz tuzatish audit nuqtai nazaridan
   * qiymatsiz — keyin uni hech kim tushuntira olmaydi.
   */
  postAdjustment(
    {
      branchId, lines, reference, date, memo, reason, dimensions = {},
    }: {
      branchId?: string | null; lines: JournalLineInput[];
      reference?: string; date?: Date; memo?: string; reason?: string;
      dimensions?: Dimensions;
    },
    actor?: Actor | null,
    { tx }: { tx?: TxClient | null } = {},
  ): Promise<PostResult> {
    return this.withTxn(tx, async (t) => {
      if (!branchId) throw new ApiError(400, "Filial ko'rsatilishi shart");
      if (!reference) throw new ApiError(400, "`reference` shart (idempotentlik)");
      if (!reason || !String(reason).trim()) {
        throw new ApiError(400, "Tuzatish uchun sabab ko'rsatilishi SHART");
      }

      return this.postCore(t, {
        branchId,
        kind: ENTRY_KINDS.ADJUSTMENT,
        date: date || new Date(),
        memo: memo || `Tuzatish: ${reason}`,
        lines,
        refModel: 'Adjustment',
        refId: null,
        postingKey: `adjustment:${reference}`,
        dimensions,
        actor,
        audit: {
          entityType: 'Adjustment', entityId: String(reference),
          action: 'create', reason, newValue: { lines },
        },
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ZAXIRA: eski chaqiruvchilar uchun "yiqilmaydigan" o'ram
  // ══════════════════════════════════════════════════════════════════

  /**
   * Xatoni YUTADIGAN o'ram — FAQAT tranzaksiyadan TASHQARIDAGI eski
   * chaqiruvchilar uchun.
   *
   * YANGI KOD BUNI ISHLATMASIN. U `helpers/journalPosting.helper.js`
   * dagi eski xulq-atvorni (log qil, davom et) saqlaydi va MAQSADI —
   * ko'chirish davomida oraliq holat. Atomik yo'l — yuqoridagi
   * amallarni `tx` bilan chaqirish.
   */
  async safely<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(
        `Moliyaviy yozuv bajarilmadi (${label}): ${(err as Error)?.message}`,
      );
      return null;
    }
  }
}
