import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OYLIK TO'LOV REJASI — `finance/services/studentPayment.service.js`.
 *
 * ⚠⚠ QISMAN KO'CHIRILGAN — ATAYLAB, VA MANBA BITTA.
 *
 * Express fayli 951 qator va uning KATTA qismi PRORATSIYA dvigateli
 * (`proration.helper`, dars kunlari, bayramlar, muzlatish oynalari,
 * bekor qilingan darslar). U `attendance` + `holidays` +
 * `lessonCancellation` + `studentFreeze` ga tayanadi va o'z to'lqinida
 * ko'chadi (`/api/finance/student-payments*` marshrutlari bilan birga).
 *
 * BU YERDA FAQAT BITTA funksiya bor: `applyPaidDelta`. Sabab —
 * `deposits` unga TAYANADI (depozitdan oylik planga qoplash), o'zi esa
 * proratsiyaga UMUMAN tegmaydi: u sof xom SQL, bitta qatorni atomik
 * o'zgartiradi.
 *
 * ⚠ BU NUSXA EMAS, MIGRATSIYANING BIRINCHI BO'LAGI. Keyingi to'lqin
 * QOLGANINI SHU FAYLGA qo'shadi — ikkinchi `StudentPaymentService`
 * YARATILMAYDI. Aks holda ikki manba paydo bo'lib, biri to'ldirilib,
 * ikkinchisi eskirib qolardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class StudentPaymentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private db(tx?: any): any {
    return tx || (this.prisma as unknown as any);
  }

  /**
   * `paidAmount` ni ATOMIK o'zgartiradi va statusni QAYTA HISOBLAYDI.
   *
   * ── NEGA XOM SQL, PRISMA `update` EMAS ──
   *
   * Status `paidAmount` ning YANGI qiymatiga bog'liq. Prisma bilan buni
   * yozish "o'qi → hisobla → yoz" bo'lardi va ikki parallel to'lov
   * o'rtasida statusni buzardi (biri ikkinchisining qiymatini ustiga
   * yozardi). Xom `UPDATE` da shart ham, yozuv ham BITTA amalda —
   * poyga umuman paydo bo'lmaydi.
   *
   * ⚠ `capToRemaining` — QOLDIQDAN OSHIRMASLIK sharti. Depozitdan
   * qoplashda kerak: parallel so'rov ulgurgan bo'lsa qator YANGILANMAYDI
   * (`affected === 0` → `null`) va chaqiruvchi "qo'llanmadi" deb biladi.
   * Buni JS'da tekshirish yana o'sha poygani ochardi.
   *
   * ⚠ `updatedAt` OCHIQ yoziladi: Prisma'ning `@updatedAt` KLIENT
   * tomonida ishlaydi, xom SQL uni chetlab o'tadi.
   */
  async applyPaidDelta(
    paymentId: string,
    delta: number,
    { tx, capToRemaining = false }: { tx?: any; capToRemaining?: boolean } = {},
  ) {
    const client = this.db(tx);
    const id = String(paymentId);
    const d = Number(delta) || 0;

    const setClause = Prisma.sql`
      SET "paidAmount" = COALESCE("paidAmount", 0) + ${d}::numeric,
          "status"     = CASE
            WHEN COALESCE("paidAmount", 0) + ${d}::numeric <= 0
              THEN 'unpaid'::"PayStatus"
            WHEN COALESCE("paidAmount", 0) + ${d}::numeric < "expectedAmount"
              THEN 'partial'::"PayStatus"
            ELSE 'paid'::"PayStatus"
          END,
          "updatedAt"  = NOW()
    `;

    const affected = capToRemaining
      ? await client.$executeRaw`
          UPDATE "student_payments" ${setClause}
          WHERE "id" = ${id}
            AND COALESCE("paidAmount", 0) + ${d}::numeric <= "expectedAmount"
        `
      : await client.$executeRaw`
          UPDATE "student_payments" ${setClause}
          WHERE "id" = ${id}
        `;

    if (affected === 0) return null;
    return client.studentPayment.findUnique({ where: { id } });
  }
}
