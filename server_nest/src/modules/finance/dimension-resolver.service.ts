import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ENTRY_KINDS, METHOD_TO_ACCOUNT } from '../../common/constants/ledger.js';
import type { TxClient } from '../journal/journal.service.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * O'LCHOV YECHUVCHI (dimension resolver)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Jurnal yozuvidagi o'lchovlar (studentId, teacherId, groupId, courseId,
 * roomId, expenseCategoryId, davr...) — Faza 16-19 dagi butun foyda
 * tahlilining poydevori. Bu fayl ularni QAYERDAN olishni va QAYSI biri
 * mumkinligini hal qiladi.
 *
 * ─── UCHTA QAT'IY QOIDA ───
 *
 * 1. O'LCHOV CHAQIRUVCHIDAN EMAS, MANBA HUJJATDAN OLINADI.
 *
 *    Chaqiruvchi faqat ID beradi ("shu to'lovni yoz"), qolganini shu
 *    yer aniqlaydi. Aks holda chaqiruvchi bexosdan
 *        student = A, group = B, branch = C
 *    kabi O'ZARO MOS KELMAYDIGAN to'plam yuborishi mumkin edi va uni
 *    hech kim tekshirmasdi — hisobot esa yillar davomida jimgina
 *    noto'g'ri bo'lardi.
 *
 * 2. TEGISHLI BO'LMAGAN O'LCHOV — NULL, TAXMIN EMAS.
 *
 *    Ijara chiqimida o'quvchi YO'Q. Uni "eng ehtimoliy" qiymat bilan
 *    to'ldirish tahlilni ishonchli KO'RSATIB, aslida buzardi. Yo'q
 *    ma'lumot NULL bo'lib qolishi kerak — shunda hisobotda
 *    "aniqlanmagan" deb ko'rinadi va bu HALOL.
 *
 * 3. NOMUVOFIQ O'LCHOV RAD ETILADI.
 *
 *    Guruh boshqa filialga tegishli bo'lsa yozuv yozilmaydi. Bunday
 *    yozuv filial kesimidagi hisobotni buzadi va uni keyin topish
 *    deyarli imkonsiz.
 */

// ── QAYSI YOZUV TURIDA QAYSI O'LCHOV MUMKIN ──
//
// Bu ro'yxat "majburiy" degani EMAS — "mumkin" degani (talab: "Do NOT
// require all dimensions"). Ro'yxatda YO'Q o'lchov berilsa — bu chaqiruv
// xatosi va rad etiladi.
//
// Masalan ichki o'tkazmada (bank → kassa) o'quvchi ham, o'qituvchi ham
// bo'lishi MUMKIN EMAS: pul markaz ichida ko'chdi, hech kimga tegishli
// emas. Agar shunday o'lchov o'tib ketsa, "o'quvchi tushumi" hisobotiga
// ichki ko'chirish qo'shilib, daromad yolg'on ko'tarilardi.
const ALLOWED_DIMENSIONS: Record<string, string[]> = {
  [ENTRY_KINDS.PAYMENT]: [
    'studentId', 'membershipId', 'groupId', 'courseId', 'roomId',
    'teacherId', 'periodYear', 'periodMonth', 'paymentMethod',
  ],
  [ENTRY_KINDS.PAYMENT_FEE]: [
    'studentId', 'membershipId', 'groupId', 'courseId', 'roomId',
    'teacherId', 'periodYear', 'periodMonth', 'paymentMethod',
    'expenseCategoryId', 'costType',
  ],
  [ENTRY_KINDS.DEPOSIT_IN]: ['studentId', 'paymentMethod'],
  [ENTRY_KINDS.DEPOSIT_OUT]: ['studentId', 'paymentMethod'],
  [ENTRY_KINDS.DEPOSIT_APPLY]: [
    'studentId', 'membershipId', 'groupId', 'courseId', 'roomId',
    'teacherId', 'periodYear', 'periodMonth',
  ],
  [ENTRY_KINDS.EXPENSE]: [
    'expenseCategoryId', 'costType', 'periodYear', 'periodMonth',
    'paymentMethod', 'attachmentId', 'staffId', 'roomId',
  ],
  [ENTRY_KINDS.SALARY]: [
    'teacherId', 'staffId', 'groupId', 'courseId', 'roomId',
    'expenseCategoryId', 'costType', 'periodYear', 'periodMonth',
    'paymentMethod',
  ],
  [ENTRY_KINDS.REFUND]: [
    'studentId', 'membershipId', 'groupId', 'courseId', 'roomId',
    // `teacherId` — STEP 5 tahlili ochgan XATO tufayli qo'shildi
    // (quyida `fromRefund` izohiga qarang).
    'teacherId',
    'periodYear', 'periodMonth', 'paymentMethod', 'attachmentId',
  ],
  // EGASINING PULI: hech qanday o'quvchi/o'qituvchi/guruh o'lchovi YO'Q.
  // Bu operatsion faoliyat emas (qarang constants/ledger.ts OWNER_CAPITAL).
  [ENTRY_KINDS.OWNER_INVESTMENT]: ['staffId', 'paymentMethod', 'attachmentId'],
  [ENTRY_KINDS.OWNER_WITHDRAWAL]: ['staffId', 'paymentMethod', 'attachmentId'],
  // ICHKI O'TKAZMA: pul markaz ichida ko'chdi — sun'iy o'lchov qo'shilmaydi.
  [ENTRY_KINDS.ACCOUNT_TRANSFER]: ['paymentMethod'],
  [ENTRY_KINDS.TRANSFER_SEND]: [],
  [ENTRY_KINDS.TRANSFER_RECEIVE]: [],
  [ENTRY_KINDS.INTER_BRANCH]: ['studentId'],
  [ENTRY_KINDS.SHIFT_CLOSE]: ['staffId'],
  [ENTRY_KINDS.OPENING]: [
    'studentId', 'teacherId', 'staffId', 'groupId', 'periodYear', 'periodMonth',
  ],
  // TUZATISH: ataylab keng — u har qanday xatoni tuzatishi mumkin.
  [ENTRY_KINDS.ADJUSTMENT]: [
    'studentId', 'teacherId', 'staffId', 'groupId', 'courseId', 'roomId',
    'membershipId', 'expenseCategoryId', 'costType', 'periodYear',
    'periodMonth', 'paymentMethod', 'attachmentId',
  ],
};

// Jurnalga yoziladigan barcha o'lchov ustunlari.
export const DIMENSION_FIELDS: readonly string[] = [
  'studentId', 'teacherId', 'staffId', 'groupId', 'courseId', 'roomId',
  'membershipId', 'expenseCategoryId', 'periodYear', 'periodMonth',
  'paymentMethod', 'costType', 'attachmentId',
];

export type Dimensions = Record<string, unknown>;

/** Bo'sh (null/undefined) o'lchovlarni olib tashlaydi. */
const compact = (dims: Dimensions = {}): Dimensions => {
  const out: Dimensions = {};
  for (const k of DIMENSION_FIELDS) {
    const v = dims[k];
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
};

@Injectable()
export class DimensionResolverService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private db(tx?: TxClient | null): TxClient {
    return (tx as TxClient) || (this.prisma as unknown as TxClient);
  }

  /**
   * Berilgan o'lchovlar shu yozuv turi uchun mumkinmi?
   *
   * Bu tekshiruv SERVIS ichida, chaqiruvchi qanchalik ishonchli
   * bo'lishidan qat'i nazar: sun'iy o'lchov bir marta yozilsa, u
   * tarixda abadiy qoladi va uni keyin ajratib olish imkonsiz.
   */
  assertApplicable(kind: string, dims: Dimensions = {}): Dimensions {
    const allowed = ALLOWED_DIMENSIONS[kind];
    if (!allowed) throw new ApiError(400, `Noma'lum jurnal yozuvi turi: ${kind}`);
    const given = Object.keys(compact(dims));
    const bad = given.filter((k) => !allowed.includes(k));
    if (bad.length) {
      throw new ApiError(
        400,
        `"${kind}" yozuvi uchun mos kelmaydigan o'lchov: ${bad.join(', ')}`,
      );
    }
    return compact(dims);
  }

  /**
   * GURUHDAN kelib chiqadigan o'lchovlar: yo'nalish va xona.
   *
   * NEGA NUSXALANADI (denormalizatsiya): guruhning xonasi keyin
   * o'zgarishi mumkin. Yozuv o'z DAVRIDAGI xonani saqlashi kerak, aks
   * holda "xona bo'yicha tushum" o'tmishga qarab QAYTA YOZILARDI va
   * kecha chop etilgan hisobot bugun boshqa raqam berardi.
   *
   * ⚠ `$branchId` QAYTARILADI, lekin u o'lchov EMAS — u `compact()`
   * dan o'tmaydi (`DIMENSION_FIELDS` da yo'q). Chaqiruvchi undan
   * filial muvofiqligini tekshirishda foydalanadi.
   */
  async groupDimensions(
    groupId?: string | null,
    tx?: TxClient | null,
  ): Promise<Dimensions & { $branchId?: string }> {
    if (!groupId) return {};
    const group = await this.db(tx).group.findUnique({
      where: { id: String(groupId) },
      select: { id: true, branchId: true, courseId: true, roomId: true },
    });
    if (!group) return {};
    return {
      groupId: group.id,
      courseId: group.courseId || null,
      roomId: group.roomId || null,
      $branchId: group.branchId,
    };
  }

  /**
   * O'QITUVCHINI GURUH VA DAVRDAN ANIQLAYDI.
   *
   * ─── NEGA "AGAR ANIQ BO'LSA" ───
   * Bir guruhda bir davrda BIR NECHTA o'qituvchi bo'lishi mumkin
   * (almashinuv, ikkinchi o'qituvchi). O'shanda tushumni qaysi biriga
   * yozish kerak? Har qanday tanlov O'YLAB TOPILGAN bo'lardi va
   * "o'qituvchi bo'yicha foyda" reytingi asossiz raqamlarga tayanardi.
   *
   * Shuning uchun qoida: AYNAN BITTA nomzod bo'lsa — yoziladi, aks
   * holda NULL. Tahlil qatlami bunday yozuvlarni guruh orqali bog'lay
   * oladi (guruh → o'qituvchilar), lekin u yerda bu TAXMIN ekani
   * ko'rinib turadi — jurnalda esa fakt bo'lib qotib qolardi.
   */
  async resolveTeacherForGroupPeriod(
    groupId?: string | null,
    year?: number | null,
    month?: number | null,
    tx?: TxClient | null,
  ): Promise<string | null> {
    if (!groupId || !year || !month) return null;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const periods = await this.db(tx).teacherGroupPeriod.findMany({
      where: {
        groupId: String(groupId),
        isDeleted: false,
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    });
    return periods.length === 1 ? periods[0].teacherId : null;
  }

  /**
   * MAOSH KATEGORIYASI (Faza 7).
   *
   * Maosh to'lovi jurnalda oddiy `expense` bo'lib turardi — ya'ni
   * "chiqim kategoriyalari" hisobotida maosh UMUMAN KO'RINMASDI,
   * holbuki u odatda eng katta xarajat. Byudjet/fakt taqqoslash ham
   * maoshsiz ma'nosiz edi.
   *
   * Kategoriya `seeds/expenseCategories.seed.js` da `isSystem: true`
   * bilan yaratiladi (code = "salary"), ya'ni o'chirib bo'lmaydi.
   *
   * ⚠ KESH SINF MAYDONIDA, modul darajasida EMAS. NestJS provayderi
   * singleton, ya'ni xatti-harakat Express'dagi modul o'zgaruvchisi
   * bilan AYNAN bir xil — lekin testlar uchun `resetCaches()` orqali
   * boshqarilishi mumkin va nusxalar bir-birini ifloslantirmaydi.
   */
  private salaryCategoryCache: string | null | undefined;

  async salaryCategoryId(tx?: TxClient | null): Promise<string | null> {
    if (this.salaryCategoryCache !== undefined) return this.salaryCategoryCache;
    const cat = await this.db(tx).expenseCategory.findFirst({
      where: { code: 'salary', branchId: null, isDeleted: false },
      select: { id: true },
    });
    this.salaryCategoryCache = cat?.id || null;
    return this.salaryCategoryCache;
  }

  /** Testlar uchun: keshni tozalaydi. */
  resetCaches(): void {
    this.salaryCategoryCache = undefined;
  }

  /**
   * FILIAL MUVOFIQLIGI.
   *
   * Yozuv bitta filialga tegishli. Unga bog'langan guruh/xona BOSHQA
   * filialniki bo'lsa — bu ma'lumot xatosi va uni YOZISHDAN OLDIN
   * to'xtatish kerak: yozilgandan keyin filial kesimidagi hisobotda
   * pul "boshqa filialda" paydo bo'ladi va sababini topish uchun
   * butun tarixni titish kerak bo'lardi.
   */
  async assertBranchConsistency(
    branchId: string | null | undefined,
    dims: Dimensions,
    tx?: TxClient | null,
  ): Promise<void> {
    if (!branchId) return;
    const bid = String(branchId);
    const client = this.db(tx);

    if (dims.groupId) {
      const g = await client.group.findUnique({
        where: { id: String(dims.groupId) },
        select: { branchId: true },
      });
      if (g && String(g.branchId) !== bid) {
        throw new ApiError(400, "Guruh boshqa filialga tegishli — yozuv rad etildi");
      }
    }
    if (dims.roomId) {
      const r = await client.room.findUnique({
        where: { id: String(dims.roomId) },
        select: { branchId: true },
      });
      if (r && String(r.branchId) !== bid) {
        throw new ApiError(400, "Xona boshqa filialga tegishli — yozuv rad etildi");
      }
    }
    if (dims.expenseCategoryId) {
      const c = await client.expenseCategory.findUnique({
        where: { id: String(dims.expenseCategoryId) },
        select: { branchId: true },
      });
      // branchId = null → umumiy kategoriya, har filialda ishlatiladi.
      if (c && c.branchId && String(c.branchId) !== bid) {
        throw new ApiError(400, "Kategoriya boshqa filialga tegishli — yozuv rad etildi");
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // MANBA HUJJAT → O'LCHOVLAR
  // ══════════════════════════════════════════════════════════════════

  /** O'QUVCHI TO'LOVI (PaymentTransaction). */
  async fromPaymentTransaction(
    trx: Record<string, unknown>,
    tx?: TxClient | null,
  ): Promise<Dimensions> {
    const client = this.db(tx);
    // A'zolik (enrollment) oylik PLANDAN olinadi — tranzaksiyada u yo'q.
    let membershipId: string | null = null;
    if (trx.paymentId) {
      const plan = await client.studentPayment.findUnique({
        where: { id: String(trx.paymentId) },
        select: { membershipId: true },
      });
      membershipId = plan?.membershipId || null;
    }
    const g = await this.groupDimensions(trx.groupId as string, tx);
    const teacherId = await this.resolveTeacherForGroupPeriod(
      trx.groupId as string,
      trx.year as number,
      trx.month as number,
      tx,
    );

    return compact({
      studentId: trx.studentId,
      membershipId,
      groupId: g.groupId,
      courseId: g.courseId,
      roomId: g.roomId,
      teacherId,
      periodYear: trx.year,
      periodMonth: trx.month,
      paymentMethod: trx.method,
    });
  }

  /** CHIQIM (Expense). */
  async fromExpense(
    expense: Record<string, unknown>,
    tx?: TxClient | null,
  ): Promise<Dimensions> {
    const client = this.db(tx);
    // costType: chiqimda ochiq ko'rsatilmagan bo'lsa — KATEGORIYADAN meros.
    let costType = (expense.costType as string) || null;
    if (!costType && expense.categoryId) {
      const cat = await client.expenseCategory.findUnique({
        where: { id: String(expense.categoryId) },
        select: { costType: true },
      });
      costType = cat?.costType || null;
    }
    return compact({
      expenseCategoryId: expense.categoryId,
      costType,
      periodYear: expense.accrualYear,
      periodMonth: expense.accrualMonth,
      paymentMethod: METHOD_TO_ACCOUNT[expense.method as string]
        ? expense.method
        : null,
      attachmentId: expense.receiptId,
    });
  }

  /** O'QITUVCHI MAOSHI (SalaryTransaction). */
  async fromTeacherSalaryTx(
    trx: Record<string, unknown>,
    tx?: TxClient | null,
  ): Promise<Dimensions> {
    const g = await this.groupDimensions(trx.groupId as string, tx);
    return compact({
      teacherId: trx.teacherId,
      groupId: g.groupId,
      courseId: g.courseId,
      roomId: g.roomId,
      expenseCategoryId: await this.salaryCategoryId(tx),
      // Maosh — o'zgaruvchan xarajat: guruh/o'quvchi soniga bog'liq
      // (foizli qism). Qat'iy oylik qismi ham bor, lekin ustun bitta
      // bo'lgani uchun ustun tabiat tanlanadi.
      costType: 'variable',
      periodYear: trx.year,
      periodMonth: trx.month,
      paymentMethod: trx.method,
    });
  }

  /** XODIM MAOSHI (StaffSalaryTransaction). */
  async fromStaffSalaryTx(
    trx: Record<string, unknown>,
    tx?: TxClient | null,
  ): Promise<Dimensions> {
    return compact({
      staffId: trx.employeeId,
      expenseCategoryId: await this.salaryCategoryId(tx),
      // Xodim oyligi odatda QAT'IY — o'quvchilar soniga bog'liq emas.
      costType: 'fixed',
      periodYear: trx.year,
      periodMonth: trx.month,
      paymentMethod: trx.method,
    });
  }

  /**
   * QAYTARIM (Refund).
   *
   * ── NEGA BU YERDA O'QITUVCHI HAM ANIQLANADI ──
   *
   * Dastlab qaytarimga faqat guruh/yo'nalish/xona muhrlanardi,
   * o'qituvchi esa YO'Q edi. Xato STEP 5 dagi foydalilik tahlilini
   * yozayotganda ko'rindi va u JIMGINA edi:
   *
   *   to'lov      → teacherId MUHRLANGAN  → o'qituvchi daromadini OSHIRADI
   *   qaytarim    → teacherId YO'Q        → o'qituvchi daromadini KAMAYTIRMAYDI
   *
   * Natijada qaytarilgan pul o'qituvchi hisobida QOLIB KETARDI: guruh
   * kesimida daromad to'g'ri (guruh muhrlangan), o'qituvchi kesimida
   * esa yuqori. Ikki hisobot bir-biriga to'g'ri kelmasdi va o'qituvchi
   * reytingi noto'g'ri chiqardi.
   *
   * DAVR asl to'lovdan olinadi: qaytarimning o'z davri yo'q, u O'SHA
   * to'lovga tegishli. Davrsiz esa o'qituvchini aniqlab bo'lmaydi
   * (`TeacherGroupPeriod` davr bo'yicha qidiriladi).
   *
   * Atributsiya qoidasi to'lovdagi bilan AYNAN BIR XIL: aynan bitta
   * o'qituvchi mos kelsa muhrlanadi, aks holda NULL.
   */
  async fromRefund(
    refund: Record<string, unknown>,
    tx?: TxClient | null,
  ): Promise<Dimensions> {
    const client = this.db(tx);
    const g = await this.groupDimensions(refund.groupId as string, tx);

    let year: number | null = null;
    let month: number | null = null;
    if (refund.originalTransactionId) {
      const orig = await client.paymentTransaction.findUnique({
        where: { id: String(refund.originalTransactionId) },
        select: { year: true, month: true },
      });
      year = orig?.year ?? null;
      month = orig?.month ?? null;
    }
    const teacherId = await this.resolveTeacherForGroupPeriod(
      refund.groupId as string,
      year,
      month,
      tx,
    );

    return compact({
      studentId: refund.studentId,
      membershipId: refund.membershipId,
      groupId: g.groupId,
      courseId: g.courseId,
      roomId: g.roomId,
      teacherId,
      periodYear: year,
      periodMonth: month,
      paymentMethod: refund.method,
      attachmentId: refund.receiptId,
    });
  }
}
