import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ROLES, PERMISSIONS } from '../../../common/constants/permissions.js';
import { branchFilter, userBranchCondition } from '../../../common/als/branch-context.js';
import { normalizePhone } from '../../../common/utils/phone.js';
import { SalaryTransactionService } from '../../teacher-salary/salary-transaction.service.js';
import { ROW_STATUS, type Importer } from '../import-engine.service.js';
import { asText, asMoney, asDate, asYear, asMonth, asEnum, isBlank } from '../coerce.js';

const METHOD_MAP: Record<string, string> = {
  naqd: 'cash', cash: 'cash', 'naqd pul': 'cash',
  karta: 'card', card: 'card', plastik: 'card', plastic: 'card',
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/** Qator "shaxsiyati": maosh qatori + summa + sana. */
const rowKey = (d: any) => `${d.salaryId}|${d.amount}|${dateKey(d.paidAt)}`;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI MAOSH TO'LOVLARI IMPORTI.
 *
 * ⚠ RUXSAT `salary.pay` — YOZISH huquqi (import eksportdan aynan shu
 * bilan farq qiladi).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class TeacherSalaryPaymentsImporter implements Importer {
  readonly key = 'teacher-salary-payments';
  readonly label = "O'qituvchi maosh to'lovlari";
  readonly fileBase = 'oqituvchi-maosh-import';
  readonly sheetName = "Maosh to'lovlari";
  readonly permission = PERMISSIONS.SALARY_PAY;

  readonly columns = [
    {
      key: 'teacherRef', header: "O'qituvchi ID (login yoki telefon)", width: 28,
      required: true, example: 'dilnoza.k',
      note: "O'qituvchining tizimdagi logini yoki telefon raqami. Majburiy.",
    },
    {
      key: 'teacherName', header: "O'qituvchi F.I.O (tekshirish uchun)", width: 26,
      required: false, example: 'Dilnoza Karimova',
      note: "Ixtiyoriy. To'ldirilsa, login bo'yicha topilgan o'qituvchi ismi bilan solishtiriladi.",
    },
    {
      key: 'groupName', header: 'Guruh', width: 22, required: true,
      example: 'Ingliz tili A1',
      note: 'Maosh har bir GURUH uchun alohida hisoblanadi, shuning uchun guruh majburiy.',
    },
    {
      key: 'year', header: 'Yil', width: 10, required: true, example: 2025,
      note: 'Maosh qaysi oyga tegishli ekani.',
    },
    {
      key: 'month', header: 'Oy', width: 10, required: true, example: 6,
      note: "1-12 oralig'ida raqam yoki oy nomi (iyun).",
    },
    {
      key: 'amount', header: "To'langan summa (so'm)", width: 20, required: true,
      example: 2000000,
      note: "Musbat butun son. Maosh qoldig'idan oshib keta olmaydi.",
    },
    {
      key: 'method', header: "To'lov turi", width: 14, required: true,
      example: 'naqd', note: 'naqd yoki karta. Majburiy.',
    },
    {
      key: 'paidAt', header: "To'lov sanasi", width: 16, required: true,
      // ⚠ NAMUNA SANA o'quvchi to'lovidagidan BOSHQA (05.07 vs 15.06) —
      // Express'da ham shunday. Uni "bir xillashtirish" klient
      // shartnomasini o'zgartirardi.
      example: '2025-07-05',
      note: "2025-07-05 yoki 05.07.2025. Kelajak sana bo'lishi mumkin emas.",
    },
    {
      key: 'note', header: 'Izoh', width: 30, required: false,
      example: 'Iyun oyi maoshi', note: 'Ixtiyoriy izoh.',
    },
  ];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly salaryTx: SalaryTransactionService,
  ) {}

  async prepare(rawRows: any[]) {
    const refs = new Set<string>();
    for (const raw of rawRows) {
      if (!isBlank(raw.teacherRef)) refs.add(norm(raw.teacherRef));
    }

    const phones = [...refs].map((r) => normalizePhone(r)).filter(Boolean) as string[];
    const branchCond = userBranchCondition();

    const teachers = await this.prisma.user.findMany({
      where: {
        role: ROLES.TEACHER,
        isDeleted: false,
        OR: [{ username: { in: [...refs] } }, { phone: { in: phones } }],
        ...(branchCond ? { AND: [branchCond] } : {}),
      } as never,
      select: {
        id: true, firstName: true, lastName: true, username: true, phone: true,
      },
    });

    const teacherByRef = new Map<string, any>();
    for (const t of teachers) {
      if (t.username) teacherByRef.set(norm(t.username), t);
      if (t.phone) teacherByRef.set(norm(t.phone), t);
    }

    const groups = await this.prisma.group.findMany({
      where: { isDeleted: false, ...branchFilter() },
      select: { id: true, name: true, isActive: true, branchId: true },
    });

    const groupByName = new Map<string, any>();
    for (const g of groups) {
      const k = norm(g.name);
      if (groupByName.has(k)) groupByName.set(k, 'AMBIGUOUS');
      else groupByName.set(k, g);
    }

    const teacherIds = [...new Set(teachers.map((t) => String(t.id)))];
    const groupIds = groups.map((g) => String(g.id));

    const salaries = teacherIds.length
      ? await this.prisma.teacherSalary.findMany({
          where: {
            ...branchFilter(),
            teacherId: { in: teacherIds },
            groupId: { in: groupIds },
          } as never,
          select: {
            id: true, teacherId: true, groupId: true, year: true, month: true,
            expectedAmount: true, paidAmount: true,
          },
        })
      : [];

    const salaryByKey = new Map<string, any>();
    for (const s of salaries) {
      salaryByKey.set(`${s.teacherId}|${s.groupId}|${s.year}|${s.month}`, s);
    }

    // ⚠ MAVJUD TO'LOVLAR — (maosh, summa, sana) bo'yicha. Fayl qayta
    // yuklansa PUL TAKRORLANMASIN.
    const existingKeys = new Set<string>();
    if (salaries.length) {
      const txs = await this.prisma.salaryTransaction.findMany({
        where: {
          salaryId: { in: salaries.map((s) => String(s.id)) }, isDeleted: false,
        },
        select: { salaryId: true, amount: true, paidAt: true },
      });
      for (const t of txs) {
        existingKeys.add(
          `${t.salaryId}|${t.amount}|${dateKey(new Date(t.paidAt as never))}`,
        );
      }
    }

    return { teacherByRef, groupByName, salaryByKey, existingKeys };
  }

  validateRow(raw: any, ctx: any) {
    const errors: any[] = [];
    const push = (field: string, message: string) => errors.push({ field, message });

    const refRes = asText(raw.teacherRef);
    const ref = norm(refRes.value);
    let teacher: any = null;
    if (!ref) push("O'qituvchi ID", "Bo'sh");
    else {
      teacher = ctx.teacherByRef.get(ref)
        || ctx.teacherByRef.get(norm(normalizePhone(ref)));
      if (!teacher) {
        push("O'qituvchi ID", "Bunday o'qituvchi topilmadi (yoki boshqa filialda)");
      }
    }

    if (teacher && !isBlank(raw.teacherName)) {
      const given = norm(raw.teacherName).replace(/\s+/g, ' ');
      const actual = norm(`${teacher.firstName} ${teacher.lastName || ''}`).replace(/\s+/g, ' ');
      const reversed = norm(`${teacher.lastName || ''} ${teacher.firstName}`).replace(/\s+/g, ' ');
      if (given !== actual && given !== reversed) {
        push(
          "O'qituvchi F.I.O",
          `Login bilan mos emas (bazada: ${teacher.firstName} ${teacher.lastName || ''})`,
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
      } else if (!found) push('Guruh', 'Bunday guruh topilmadi (yoki boshqa filialda)');
      else group = found;
    }

    const yearRes = asYear(raw.year);
    if (!yearRes.ok) push('Yil', yearRes.error!);
    const monthRes = asMonth(raw.month);
    if (!monthRes.ok) push('Oy', monthRes.error!);

    const amountRes = asMoney(raw.amount, { min: 1 });
    if (!amountRes.ok) push("To'langan summa", amountRes.error!);

    const methodRes = asEnum(raw.method, METHOD_MAP);
    if (!methodRes.ok) push("To'lov turi", methodRes.error!);

    const dateRes = asDate(raw.paidAt);
    if (!dateRes.ok) push("To'lov sanasi", dateRes.error!);

    const noteRes = asText(raw.note, { max: 300 });
    if (!noteRes.ok) push('Izoh', noteRes.error!);

    let salary: any = null;
    if (teacher && group && yearRes.ok && monthRes.ok) {
      salary = ctx.salaryByKey.get(
        `${teacher.id}|${group.id}|${yearRes.value}|${monthRes.value}`,
      );
      if (!salary) {
        push(
          'Oy',
          "Bu o'qituvchi uchun shu guruh va oyda maosh hujjati yo'q " +
            "(o'qituvchi o'sha oyda guruhga biriktirilmagan yoki maosh hali hisoblanmagan)",
        );
      } else if (amountRes.ok) {
        // ⚠ QOLDIQDAN OSHIB KETMASIN — bu yerda ushlanmasa `applyPaidDelta`
        // ning `capToRemaining` i yozuvni rad etardi va qator "yozishda
        // xato" bo'lib chiqardi (sabab ko'rinmasdi).
        const remaining = Math.max(
          0,
          (Number(salary.expectedAmount) || 0) - (Number(salary.paidAmount) || 0),
        );
        if ((amountRes.value as number) > remaining) {
          push(
            "To'langan summa",
            `Qoldiqdan oshib ketadi (qoldiq: ${remaining.toLocaleString('uz-UZ')} so'm)`,
          );
        }
      }
    }

    if (errors.length) return { errors, data: null };

    return {
      errors: [],
      data: {
        salaryId: salary.id,
        teacherName: `${teacher.firstName} ${teacher.lastName || ''}`.trim(),
        groupName: group.name,
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
    return data ? rowKey(data) : null;
  }

  async commitRow(data: any, _ctx: any, { currentUser }: any) {
    const result: any = await this.salaryTx.create(
      {
        salaryId: data.salaryId,
        amount: data.amount,
        method: data.method,
        paidAt: data.paidAt,
        note: data.note || 'Excel import',
      } as never,
      currentUser,
    );

    if (result?.pendingApproval) {
      return {
        status: ROW_STATUS.PENDING,
        message: "Chiqim limitidan oshdi - tasdiqqa yuborildi",
      };
    }
    return { status: ROW_STATUS.IMPORTED };
  }
}
