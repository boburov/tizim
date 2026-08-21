import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ROLES, PERMISSIONS } from '../../../common/constants/permissions.js';
import { branchFilter, userBranchCondition } from '../../../common/als/branch-context.js';
import { normalizePhone } from '../../../common/utils/phone.js';
import { TransactionService } from '../../finance/transaction.service.js';
import { ROW_STATUS, type Importer } from '../import-engine.service.js';
import { asText, asMoney, asDate, asYear, asMonth, asEnum, isBlank } from '../coerce.js';

const METHOD_MAP: Record<string, string> = {
  naqd: 'cash', cash: 'cash', 'naqd pul': 'cash',
  karta: 'card', card: 'card', plastik: 'card', plastic: 'card',
  'bank karta': 'card',
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * ⚠ IDEMPOTENTLIK KALITI — qatorning "shaxsiyati".
 *
 * Bir xil (o'quvchi, guruh, oy, summa, sana) juftligi IKKI MARTA
 * yozilmaydi: fayl qayta yuklansa ham pul TAKRORLANMAYDI.
 */
const buildIdempotencyKey = (d: any) =>
  'imp:sp:' +
  crypto
    .createHash('sha256')
    .update([
      String(d.studentId), String(d.groupId), d.year, d.month, d.amount,
      dateKey(d.paidAt),
    ].join('|'))
    .digest('hex')
    .slice(0, 40);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI TO'LOVLARI IMPORTI.
 *
 * ⚠ RUXSAT `finance.pay` — O'QISH emas, YOZISH huquqi. Ro'yxatni ko'ra
 * oladigan xodim avtomatik ravishda OMMAVIY YOZISH huquqini OLMASLIGI
 * kerak — bu importning eng muhim farqi eksportdan.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class StudentPaymentsImporter implements Importer {
  readonly key = 'student-payments';
  readonly label = "O'quvchi to'lovlari";
  readonly fileBase = 'oquvchi-tolovlari-import';
  readonly sheetName = "To'lovlar";
  readonly permission = PERMISSIONS.FINANCE_PAY;

  readonly columns = [
    {
      key: 'studentRef', header: "O'quvchi ID (login yoki telefon)", width: 26,
      required: true, example: 'ali.valiyev',
      note: "O'quvchining tizimdagi logini yoki telefon raqami. Majburiy.",
    },
    {
      key: 'studentName', header: "O'quvchi F.I.O (tekshirish uchun)", width: 26,
      required: false, example: 'Ali Valiyev',
      note: "Ixtiyoriy. To'ldirilsa, login bo'yicha topilgan o'quvchi ismi bilan solishtiriladi.",
    },
    {
      key: 'groupName', header: 'Guruh', width: 22, required: true,
      example: 'Ingliz tili A1',
      note: "Guruh nomi (aynan tizimdagidek). Majburiy - to'lov qaysi guruh oyiga tegishli ekani shundan aniqlanadi.",
    },
    {
      key: 'year', header: 'Yil', width: 10, required: true, example: 2025,
      note: "To'lov qaysi oy uchun ekani. Masalan 2025.",
    },
    {
      key: 'month', header: 'Oy', width: 10, required: true, example: 6,
      note: "1-12 oralig'ida raqam yoki oy nomi (iyun).",
    },
    {
      key: 'amount', header: "To'lov summasi (so'm)", width: 20, required: true,
      example: 500000,
      note: 'Musbat butun son. Oylik qarzdan ortsa - keyingi qarz oylarga, qolgani depozitga (garov) tushadi.',
    },
    {
      key: 'method', header: "To'lov turi", width: 14, required: false,
      example: 'naqd',
      note: "naqd yoki karta. Bo'sh qoldirilsa - naqd.",
    },
    {
      key: 'paidAt', header: "To'lov sanasi", width: 16, required: true,
      example: '2025-06-15',
      note: "2025-06-15 yoki 15.06.2025. Kelajak sana bo'lishi mumkin emas.",
    },
    {
      key: 'note', header: 'Izoh', width: 30, required: false,
      example: 'Iyun oyi uchun', note: 'Ixtiyoriy izoh.',
    },
  ];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
  ) {}

  async prepare(rawRows: any[]) {
    const refs = new Set<string>();
    for (const raw of rawRows) {
      if (!isBlank(raw.studentRef)) refs.add(norm(raw.studentRef));
    }

    const phones = [...refs].map((r) => normalizePhone(r)).filter(Boolean) as string[];
    const branchCond = userBranchCondition();

    const students = await this.prisma.user.findMany({
      where: {
        role: ROLES.STUDENT,
        isDeleted: false,
        OR: [{ username: { in: [...refs] } }, { phone: { in: phones } }],
        ...(branchCond ? { AND: [branchCond] } : {}),
      } as never,
      select: {
        id: true, firstName: true, lastName: true, username: true, phone: true,
      },
    });

    const studentByRef = new Map<string, any>();
    for (const s of students) {
      if (s.username) studentByRef.set(norm(s.username), s);
      if (s.phone) studentByRef.set(norm(s.phone), s);
    }

    const groups = await this.prisma.group.findMany({
      where: { isDeleted: false, ...branchFilter() },
      select: { id: true, name: true, isActive: true, branchId: true },
    });

    const groupByName = new Map<string, any>();
    for (const g of groups) {
      const k = norm(g.name);
      // ⚠ Bir xil nomli IKKI guruh — "AMBIGUOUS": to'lov qaysi biriga
      // tegishli ekanini TAXMIN qilish pulni noto'g'ri guruhga yozardi.
      if (groupByName.has(k)) groupByName.set(k, 'AMBIGUOUS');
      else groupByName.set(k, g);
    }

    const studentIds = [...new Set(students.map((s) => String(s.id)))];
    const groupIds = groups.map((g) => g.id);
    const obligations = studentIds.length
      ? await this.prisma.studentPayment.findMany({
          where: {
            ...branchFilter(),
            studentId: { in: studentIds },
            groupId: { in: groupIds },
            // ⚠ `isDeleted` YO'Q — `StudentPayment` da bunday USTUN
            // umuman yo'q. Express'da bu Mongo qoldig'i edi va Prisma
            // uni "Unknown argument" bilan rad etardi.
          } as never,
          select: {
            id: true, studentId: true, groupId: true, year: true, month: true,
            expectedAmount: true, paidAmount: true, writtenOff: true,
          },
        })
      : [];

    const obligationByKey = new Map<string, any>();
    for (const o of obligations) {
      obligationByKey.set(`${o.studentId}|${o.groupId}|${o.year}|${o.month}`, o);
    }

    const ctx: any = {
      studentByRef, groupByName, obligationByKey, existingKeys: new Set<string>(),
    };

    // ⚠ DUBLIKAT KALITLARI OLDINDAN yuklanadi: `validateAll` ularni
    // `ctx.existingKeys` dan o'qiydi va "bazada allaqachon bor" deb
    // belgilaydi — pul IKKI MARTA yozilmasin.
    const keys: string[] = [];
    for (const raw of rawRows) {
      const { errors, data } = this.validateRow(raw, ctx);
      if (!errors.length && data) keys.push(buildIdempotencyKey(data));
    }

    if (keys.length) {
      const existing = await this.prisma.paymentTransaction.findMany({
        where: { idempotencyKey: { in: keys } },
        select: { idempotencyKey: true },
      });
      ctx.existingKeys = new Set(existing.map((t) => t.idempotencyKey));
    }

    return ctx;
  }

  validateRow(raw: any, ctx: any) {
    const errors: any[] = [];
    const push = (field: string, message: string) => errors.push({ field, message });

    const refRes = asText(raw.studentRef);
    const ref = norm(refRes.value);
    let student: any = null;
    if (!ref) push("O'quvchi ID", "Bo'sh");
    else {
      student = ctx.studentByRef.get(ref)
        || ctx.studentByRef.get(norm(normalizePhone(ref)));
      if (!student) {
        push("O'quvchi ID", "Bunday o'quvchi topilmadi (yoki boshqa filialda)");
      }
    }

    if (student && !isBlank(raw.studentName)) {
      const given = norm(raw.studentName).replace(/\s+/g, ' ');
      const actual = norm(`${student.firstName} ${student.lastName || ''}`).replace(/\s+/g, ' ');
      const reversed = norm(`${student.lastName || ''} ${student.firstName}`).replace(/\s+/g, ' ');
      if (given !== actual && given !== reversed) {
        push(
          "O'quvchi F.I.O",
          `Login bilan mos emas (bazada: ${student.firstName} ${student.lastName || ''})`,
        );
      }
    }

    const groupRes = asText(raw.groupName);
    let group: any = null;
    if (!groupRes.value) push('Guruh', "Bo'sh");
    else {
      const found = ctx.groupByName.get(norm(groupRes.value as string));
      if (found === 'AMBIGUOUS') {
        push('Guruh', "Bu nomda bir nechta guruh bor - nomni aniqlashtiring");
      } else if (!found) {
        push('Guruh', 'Bunday guruh topilmadi (yoki boshqa filialda)');
      } else group = found;
    }

    const yearRes = asYear(raw.year);
    if (!yearRes.ok) push('Yil', yearRes.error!);
    const monthRes = asMonth(raw.month);
    if (!monthRes.ok) push('Oy', monthRes.error!);

    const amountRes = asMoney(raw.amount, { min: 1, max: 50_000_000 });
    if (!amountRes.ok) push("To'lov summasi", amountRes.error!);

    const dateRes = asDate(raw.paidAt);
    if (!dateRes.ok) push("To'lov sanasi", dateRes.error!);

    const methodRes = asEnum(raw.method, METHOD_MAP, { fallback: 'cash' });
    if (!methodRes.ok) push("To'lov turi", methodRes.error!);

    const noteRes = asText(raw.note, { max: 300 });
    if (!noteRes.ok) push('Izoh', noteRes.error!);

    let obligation: any = null;
    if (student && group && yearRes.ok && monthRes.ok) {
      obligation = ctx.obligationByKey.get(
        `${student.id}|${group.id}|${yearRes.value}|${monthRes.value}`,
      );
      if (!obligation) {
        push(
          'Oy',
          "Bu o'quvchi uchun shu guruh va oyda to'lov rejasi yo'q " +
            "(o'quvchi o'sha oyda guruhda bo'lmagan yoki oylik hali yaratilmagan)",
        );
      } else if (obligation.writtenOff) {
        push('Oy', "Bu oy yomon qarz sifatida hisobdan chiqarilgan - to'lov yozib bo'lmaydi");
      }
    }

    if (errors.length) return { errors, data: null };

    return {
      errors: [],
      data: {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName || ''}`.trim(),
        groupId: group.id,
        groupName: group.name,
        paymentId: obligation.id,
        year: yearRes.value,
        month: monthRes.value,
        amount: amountRes.value,
        method: methodRes.value,
        paidAt: dateRes.value,
        note: noteRes.value,
      },
    };
  }

  dedupeKey(data: any) {
    return data ? buildIdempotencyKey(data) : null;
  }

  async commitRow(data: any, _ctx: any, { currentUser }: any) {
    const result: any = await this.transactions.create(
      {
        paymentId: data.paymentId,
        amount: data.amount,
        method: data.method,
        paidAt: data.paidAt,
        note: data.note || 'Excel import',
        idempotencyKey: buildIdempotencyKey(data),
      },
      currentUser,
    );

    if (result?.duplicate) {
      return { status: ROW_STATUS.DUPLICATE, message: 'Allaqachon kiritilgan' };
    }

    const parts: string[] = [];
    if (result?.allocated) parts.push(`${result.allocated} oyga taqsimlandi`);
    if (result?.depositCredited) {
      parts.push(`${result.depositCredited.toLocaleString('uz-UZ')} so'm depozitga`);
    }
    return { status: ROW_STATUS.IMPORTED, message: parts.join(', ') || undefined };
  }
}
