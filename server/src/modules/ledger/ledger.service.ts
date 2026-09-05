import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { userBranchCondition } from '../../common/als/branch-context.js';
import { OpeningBalanceService } from '../opening-balance/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHAXSIY MOLIYAVIY TARIX (LEDGER) — "bu balans QAYERDAN chiqdi?"
 *
 * ── BU O'QISH MODELI. YANGI JADVAL EMAS. ──
 *
 * Ledger hech narsa SAQLAMAYDI va hech narsa YOZMAYDI. U mavjud
 * hujjatlarni (oylik plan, to'lov, depozit, maosh qatori) bitta ISHORA
 * QOIDASIGA keltirib, sana bo'yicha saralaydi va yugurib boruvchi
 * balansni hisoblaydi.
 *
 * ⚠ NEGA ALOHIDA "balances" JADVALI QILINMADI: balans ikkinchi joyda
 * saqlanganida u MUQARRAR eskiradi — to'lov qabul qilinganda biri
 * kamayadi, ikkinchisi qolib ketadi va qaysi biri haqiqat ekani noma'lum
 * bo'ladi. Bu yerda haqiqat bitta: MANBA HUJJATLAR.
 *
 * ── ISHORA QOIDASI (butun fayl bo'ylab bitta) ──
 *     +X = MARKAZ shu shaxsga X qarzdor
 *     −X = SHAXS markazga X qarzdor
 *
 * ── DEPOZIT: NEGA "qoplash" QATORI YO'Q ──
 *
 * O'quvchi depozitiga tushgan pul KIRIM paytida (+) hisoblanadi. Keyin u
 * oylik qarzga qoplanganda pul markaz ICHIDA bir cho'ntakdan ikkinchisiga
 * o'tadi — SOF holat o'zgarmaydi:
 *     DepositTransaction(topup)             → +
 *     DepositTransaction(withdraw)          → −
 *     PaymentTransaction(source:"deposit")  → hisobga OLINMAYDI
 *     DepositTransaction(refund)            → hisobga OLINMAYDI
 * Aks holda 300k depozit + 300k qoplama = +600k bo'lib, o'quvchi bir
 * marta bergan pul balansda IKKI MARTA ko'rinardi.
 *
 * ── BOSHLANG'ICH QOLDIQ: MATERIALIZATSIYA QATORLARI CHIQARILADI ──
 *
 * Qoldiq mavjud mexanizmga "sintetik" hujjat sifatida yoziladi
 * (`isOpening`). Ledger esa uni `OpeningBalance` hujjatining O'ZIDAN
 * oladi. Ikkalasini ham sanasak — IKKI BARAVAR. Manba sifatida aynan
 * LANGAR hujjat tanlandi, chunki u materializatsiya bo'lmaganda ham
 * (guruh kutayotgan o'quvchi) mavjud va balans o'sha zahoti to'g'ri.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Qator turlari — UI shu kalitlar bo'yicha ikonka/rang tanlaydi. */
export const LEDGER_TYPES = {
  OPENING: 'opening',
  CHARGE: 'charge',
  ACCRUAL: 'accrual',
  PAYMENT_IN: 'payment_in',
  PAYMENT_OUT: 'payment_out',
  DEPOSIT_IN: 'deposit_in',
  DEPOSIT_OUT: 'deposit_out',
  ADJUSTMENT: 'adjustment',
} as const;

const TEACHER_KIND_LABELS: Record<string, string> = {
  group: 'Guruh maoshi',
  base: 'Fiksa oylik',
  bonus: 'Mukofot',
  deduction: 'Ushlanma',
};

/** `isDeleted` ustuni NOT NULL (default false). */
const notDeleted = { isDeleted: false } as const;

const toId = (id: unknown) => String(id);

/** Oy raqamidan davr yorlig'i: 2026-05 → "05.2026". */
const periodLabel = (year: number, month: number) =>
  `${String(month).padStart(2, '0')}.${year}`;

/** Oyning oxirgi kuni — hisoblangan (accrual) qatorlar shu sanaga tushadi. */
const periodEndDate = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0));

/**
 * ⚠ EKSPORT QILINADI: kontroller metodining qaytish turi shu interfeysga
 * tayanadi va TypeScript nomlanmaydigan turni e'lon fayliga yoza olmaydi
 * (TS4053). Ichki deb qoldirish `nest build` ni yiqitadi.
 */
export interface LedgerRow {
  type: string;
  date: Date | string;
  sortKey?: number;
  period: string;
  amount: number;
  title: string;
  note: string;
  refId: string;
  pending?: boolean;
  pendingReason?: string;
  balanceAfter?: number;
}

@Injectable()
export class LedgerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly opening: OpeningBalanceService,
  ) {}

  /**
   * Boshlang'ich qoldiq qatori. Har uch rol uchun bir xil ko'rinadi —
   * farq faqat izohda.
   */
  private openingRow(ob: any): LedgerRow | null {
    const amount = this.opening.partyAmount(ob);
    if (!amount) return null;
    return {
      type: LEDGER_TYPES.OPENING,
      // ⚠ Bu qator ledgerda HAR DOIM birinchi turishi kerak, shuning
      // uchun saralashda alohida ustunlik (`sortKey: 0`) beriladi — bir
      // kunda yozilgan boshqa qator uni yuqoriga itarib yubormasin.
      date: periodEndDate(ob.year, ob.month),
      sortKey: 0,
      period: periodLabel(ob.year, ob.month),
      amount,
      title: "Boshlang'ich qoldiq",
      note:
        ob.note ||
        (amount > 0
          ? "Tizimga o'tishdan oldingi qoldiq - markaz qarzdor"
          : "Tizimga o'tishdan oldingi qoldiq - shaxs qarzdor"),
      // Materializatsiya kutayotgan bo'lsa UI ogohlantirish ko'rsatadi:
      // qarz balansda bor, lekin qarzdorlar ro'yxatida hali yo'q.
      pending: !ob.materializedAt,
      pendingReason: ob.pendingReason || '',
      refId: String(ob.id),
    };
  }

  // ─────────────────────────── O'QUVCHI ───────────────────────────

  private async studentRows(userId: string): Promise<LedgerRow[]> {
    const sid = toId(userId);

    const [plans, payments, depositTxns] = await Promise.all([
      // ⚠ `isOpening` CHIQARIB TASHLANADI — u boshlang'ich qoldiq
      // qatorining materializatsiyasi.
      this.prisma.studentPayment.findMany({
        where: { studentId: sid, isOpening: false },
        select: {
          id: true, year: true, month: true, expectedAmount: true,
          writtenOff: true, writeOffAmount: true, writeOffAt: true,
          groupId: true, group: { select: { name: true } },
        },
      }),

      /**
       * ⚠ Shart `{ not: "deposit" }` shaklida, `source: "direct"` EMAS:
       * `source` maydoni keyinroq qo'shilgan va undan oldingi hujjatlarda
       * umuman yo'q. Tenglik bilan qidirilganda o'sha eski to'lovlar
       * tushmay qolib, balans o'quvchi ZARARIGA (to'lamagandek) chiqardi.
       */
      this.prisma.paymentTransaction.findMany({
        where: { studentId: sid, source: { not: 'deposit' }, ...notDeleted },
        select: {
          id: true, amount: true, paidAt: true, method: true,
          note: true, year: true, month: true,
        },
      }),

      // Depozit: faqat HAQIQIY pul harakati (topup/withdraw).
      this.prisma.depositTransaction.findMany({
        where: {
          studentId: sid,
          type: { in: ['topup', 'withdraw'] },
          isOpening: false,
          ...notDeleted,
        },
        select: {
          id: true, amount: true, type: true, paidAt: true,
          method: true, note: true,
        },
      }),
    ]);

    const rows: LedgerRow[] = [];

    for (const p of plans as any[]) {
      // HISOBLANGAN OYLIK: o'quvchi markazga qarzdor bo'ladi → MANFIY.
      if (p.expectedAmount) {
        rows.push({
          type: LEDGER_TYPES.CHARGE,
          date: periodEndDate(p.year, p.month),
          period: periodLabel(p.year, p.month),
          amount: -p.expectedAmount,
          title: `Oylik to'lov${p.group?.name ? ` - ${p.group.name}` : ''}`,
          note: '',
          refId: String(p.id),
        });
      }
      // HISOBDAN CHIQARISH: majburiyat kamayadi → MUSBAT. Bu KORREKSIYA,
      // to'lov EMAS — shuning uchun alohida tur.
      if (p.writtenOff && p.writeOffAmount) {
        rows.push({
          type: LEDGER_TYPES.ADJUSTMENT,
          date: p.writeOffAt || periodEndDate(p.year, p.month),
          period: periodLabel(p.year, p.month),
          amount: p.writeOffAmount,
          title: 'Qarz hisobdan chiqarildi',
          note: 'Undirilmaydigan qarz sifatida yopildi',
          refId: String(p.id),
        });
      }
    }

    for (const t of payments as any[]) {
      rows.push({
        type: LEDGER_TYPES.PAYMENT_IN,
        date: t.paidAt,
        period: periodLabel(t.year, t.month),
        amount: t.amount,
        title: t.method === 'card' ? "To'lov (karta)" : "To'lov (naqd)",
        note: t.note || '',
        refId: String(t.id),
      });
    }

    for (const d of depositTxns as any[]) {
      const isIn = d.type === 'topup';
      rows.push({
        type: isIn ? LEDGER_TYPES.DEPOSIT_IN : LEDGER_TYPES.DEPOSIT_OUT,
        date: d.paidAt,
        period: '',
        amount: isIn ? d.amount : -d.amount,
        title: isIn ? "Depozitga to'ldirish" : 'Depozitdan qaytarish',
        note: d.note || '',
        refId: String(d.id),
      });
    }

    return rows;
  }

  // ────────────────────────── O'QITUVCHI ──────────────────────────

  private async teacherRows(userId: string): Promise<LedgerRow[]> {
    const tid = toId(userId);

    const [salaries, payouts] = await Promise.all([
      // ⚠ `TeacherSalary` da softDelete YO'Q — shuning uchun bu yerda
      // `isDeleted` filtri ham yo'q.
      this.prisma.teacherSalary.findMany({
        where: { teacherId: tid, isOpening: false },
        select: {
          id: true, year: true, month: true, expectedAmount: true,
          kind: true, reason: true, groupId: true,
          group: { select: { name: true } },
        },
      }),
      this.prisma.salaryTransaction.findMany({
        where: { teacherId: tid, ...notDeleted },
        select: {
          id: true, amount: true, paidAt: true, method: true,
          note: true, year: true, month: true,
        },
      }),
    ]);

    const rows: LedgerRow[] = [];

    for (const s of salaries as any[]) {
      if (!s.expectedAmount) continue;
      /**
       * ⚠ `expectedAmount` ALLAQACHON ishorali: ushlanma (deduction)
       * MANFIY saqlanadi. Shuning uchun bu yerda ishora
       * O'ZGARTIRILMAYDI — hisoblangan maosh markazning qarzini
       * oshiradi (+), ushlanma esa kamaytiradi (−).
       */
      const isDeduction = s.expectedAmount < 0;
      rows.push({
        type: isDeduction ? LEDGER_TYPES.ADJUSTMENT : LEDGER_TYPES.ACCRUAL,
        date: periodEndDate(s.year, s.month),
        period: periodLabel(s.year, s.month),
        amount: s.expectedAmount,
        title: `${TEACHER_KIND_LABELS[s.kind] || 'Maosh'}${
          s.group?.name ? ` - ${s.group.name}` : ''
        }`,
        note: s.reason || '',
        refId: String(s.id),
      });
    }

    for (const t of payouts as any[]) {
      rows.push({
        type: LEDGER_TYPES.PAYMENT_OUT,
        date: t.paidAt,
        period: periodLabel(t.year, t.month),
        amount: -t.amount,
        title: t.method === 'card' ? "Maosh to'landi (karta)" : "Maosh to'landi (naqd)",
        note: t.note || '',
        refId: String(t.id),
      });
    }

    return rows;
  }

  // ──────────────────────────── XODIM ────────────────────────────

  private async staffRows(userId: string): Promise<LedgerRow[]> {
    const eid = toId(userId);

    const [payrolls, payouts] = await Promise.all([
      this.prisma.staffPayroll.findMany({
        where: { employeeId: eid },
        select: {
          id: true, year: true, month: true, finalAmount: true,
          openingCreditTotal: true, openingDebtApplied: true,
        },
      }),
      this.prisma.staffSalaryTransaction.findMany({
        where: { employeeId: eid, ...notDeleted },
        select: {
          id: true, amount: true, paidAt: true, method: true,
          note: true, year: true, month: true,
        },
      }),
    ]);

    const rows: LedgerRow[] = [];

    for (const p of payrolls as any[]) {
      /**
       * ⚠ BOSHLANG'ICH QOLDIQ QISMI AJRATIB TASHLANADI.
       *
       * `finalAmount` ichida boshlang'ich qoldiq ALLAQACHON qatnashgan
       * (`gross` ga `openingCreditTotal` qo'shiladi, undan
       * `openingDebtApplied` ayriladi). Ledgerda esa qoldiq ALOHIDA
       * qator bo'lib turibdi — chiqarib tashlanmasa IKKI MARTA
       * hisoblanardi.
       *
       * Natija = o'sha oyda HAQIQATAN ishlab topilgan summa.
       */
      const earned =
        (p.finalAmount || 0) -
        (p.openingCreditTotal || 0) +
        (p.openingDebtApplied || 0);
      if (!earned) continue;
      rows.push({
        type: LEDGER_TYPES.ACCRUAL,
        date: periodEndDate(p.year, p.month),
        period: periodLabel(p.year, p.month),
        amount: earned,
        title: 'Oylik maosh',
        note: '',
        refId: String(p.id),
      });
    }

    for (const t of payouts as any[]) {
      rows.push({
        type: LEDGER_TYPES.PAYMENT_OUT,
        date: t.paidAt,
        period: periodLabel(t.year, t.month),
        amount: -t.amount,
        title: t.method === 'card' ? "Maosh to'landi (karta)" : "Maosh to'landi (naqd)",
        note: t.note || '',
        refId: String(t.id),
      });
    }

    return rows;
  }

  // ─────────────────────────── UMUMIY YO'L ───────────────────────────

  /**
   * Shaxsning to'liq moliyaviy tarixi + joriy balansi.
   *
   * ⚠ FILIAL BO'YICHA FILTR QATORLAR DARAJASIDA ATAYLAB YO'Q. Ko'lam BIR
   * MARTA, ODAM darajasida tekshiriladi (`userBranchCondition`) — begona
   * filial xodimining hisobi umuman ochilmaydi. Lekin hisob OCHILGACH u
   * TO'LIQ ko'rsatiladi: "bu odamga qancha qarzmiz?" degan savolning
   * filialga bo'lingan javobi YO'Q. O'qituvchi ikki filialda dars bersa,
   * bir filialdagi maoshini yashirgan balans — NOTO'G'RI balans.
   */
  async statementFor(
    userId: string,
    {
      from = null,
      to = null,
      ownProfile = false,
    }: { from?: any; to?: any; ownProfile?: boolean } = {},
  ) {
    // ⚠ O'Z profilida ko'lam chetlab o'tiladi: odam HAR DOIM o'z balansini
    // ko'rishi kerak, aktiv filial konteksti esa (o'qituvchi boshqa
    // filialga vaqtincha biriktirilgan bo'lsa) uni o'zidan ajratib
    // qo'yishi mumkin edi.
    const branchCond = ownProfile ? null : userBranchCondition();
    const uid = toId(userId);
    const user = await this.prisma.user.findFirst({
      where: branchCond ? { id: uid, AND: [branchCond] } : { id: uid },
      select: {
        id: true, firstName: true, lastName: true, username: true,
        role: true, hiredAt: true, enrolledAt: true, homeBranchId: true,
      },
    });
    if (!user) throw new ApiError(404, 'Foydalanuvchi topilmadi');

    const ob = await this.prisma.openingBalance.findFirst({ where: { userId: uid } });

    // Rol bo'yicha quruvchi. O'qituvchi ham, o'quvchi ham EMAS bo'lsa
    // (direktor, administrator, buxgalter...) — XODIM hisobi.
    const rows: LedgerRow[] =
      user.role === ROLES.STUDENT
        ? await this.studentRows(uid)
        : user.role === ROLES.TEACHER
          ? await this.teacherRows(uid)
          : await this.staffRows(uid);

    const opening = ob ? this.openingRow(ob) : null;
    if (opening) rows.push(opening);

    /**
     * SARALASH: sana → ustunlik → tur.
     *
     * Bir kunda hisoblangan oylik va o'sha kungi to'lov birga tushadi;
     * qaysi biri oldin turishi yugurib boruvchi balansning ORALIQ
     * qiymatiga ta'sir qiladi (yakuniy balansga emas). Hisoblangan
     * majburiyat OLDIN, to'lov KEYIN — "avval qarz paydo bo'ldi, keyin
     * yopildi" degan tabiiy o'qish shu.
     */
    const typeOrder: Record<string, number> = {
      [LEDGER_TYPES.OPENING]: 0,
      [LEDGER_TYPES.CHARGE]: 1,
      [LEDGER_TYPES.ACCRUAL]: 1,
      [LEDGER_TYPES.ADJUSTMENT]: 2,
      [LEDGER_TYPES.DEPOSIT_IN]: 3,
      [LEDGER_TYPES.DEPOSIT_OUT]: 3,
      [LEDGER_TYPES.PAYMENT_IN]: 4,
      [LEDGER_TYPES.PAYMENT_OUT]: 4,
    };

    rows.sort((a, b) => {
      const ka = a.sortKey ?? 1;
      const kb = b.sortKey ?? 1;
      if (ka !== kb) return ka - kb;
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      return (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
    });

    // YUGURIB BORUVCHI BALANS — foydalanuvchi aynan shu ustundan
    // balansning qanday shakllanganini o'qiydi.
    let running = 0;
    for (const r of rows) {
      running += r.amount;
      r.balanceAfter = running;
    }

    const currentBalance = running;

    /**
     * ⚠ FILTR SARALASHDAN KEYIN qo'llanadi: `balanceAfter` TO'LIQ
     * tarixdan hisoblanishi shart, aks holda oraliq ko'rinishda balans
     * noldan boshlanib, YOLG'ON raqam chiqarardi.
     */
    let visible = rows;
    if (from || to) {
      // ⚠ Yaroqsiz sana (NaN) e'tiborsiz qoldiriladi: aks holda har
      // qanday taqqoslash `false` bo'lib, ro'yxat JIMGINA bo'sh chiqardi
      // va bu "tranzaksiya yo'q" degan yolg'on xulosaga olib kelardi.
      const ms = (v: any) => {
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? null : t;
      };
      const fromMs = (from && ms(from)) ?? -Infinity;
      const toMs = (to && ms(to)) ?? Infinity;
      visible = rows.filter((r) => {
        const t = new Date(r.date).getTime();
        return t >= fromMs && t <= toMs;
      });
    }

    const sumOf = (pred: (r: LedgerRow) => boolean) =>
      rows.filter(pred).reduce((s, r) => s + r.amount, 0);

    return {
      user,
      openingBalance: opening?.amount || 0,
      currentBalance,
      rows: visible,
      summary: {
        // Hisoblangan majburiyatlar (o'quvchida qarz, xodimda maosh).
        accrued: sumOf(
          (r) => r.type === LEDGER_TYPES.CHARGE || r.type === LEDGER_TYPES.ACCRUAL,
        ),
        // Haqiqiy pul harakati.
        paid: sumOf(
          (r) =>
            r.type === LEDGER_TYPES.PAYMENT_IN ||
            r.type === LEDGER_TYPES.PAYMENT_OUT ||
            r.type === LEDGER_TYPES.DEPOSIT_IN ||
            r.type === LEDGER_TYPES.DEPOSIT_OUT,
        ),
        adjustments: sumOf((r) => r.type === LEDGER_TYPES.ADJUSTMENT),
        rowCount: rows.length,
        // Boshlang'ich qoldiq hali yozilmagan bo'lsa, qarzdorlar ro'yxati
        // bilan ledger VAQTINCHA farq qiladi.
        openingPending: Boolean(opening?.pending),
      },
    };
  }
}
