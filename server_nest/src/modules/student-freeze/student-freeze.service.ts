import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI MUZLATISHI — ⚠ QISMAN KO'CHIRILGAN.
 *
 * Bu yerda FAQAT `users` ro'yxatiga kerak bo'lgan IKKI o'qish metodi bor.
 * `POST /:studentId/freeze`, `POST /:studentId/unfreeze`, `GET /:studentId`
 * marshrutlari va ular ortidagi biznes mantiq FAZA 4 da ko'chadi —
 * ular to'lov proratsiyasiga tegadi va `finance` moduli bilan birga
 * ko'chirilishi kerak.
 *
 * SHU SABABLI BU MODULDA KONTROLLER YO'Q. Marshrutlar hamon Express'da;
 * bu yerda yozuv amali UMUMAN yo'q — ya'ni ikki stek muzlatishni bir
 * vaqtda o'zgartira olmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ActiveFreeze {
  studentId: string;
  startDate: Date;
  reason: string | null;
}

@Injectable()
export class StudentFreezeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** HOZIR muzlatilgan barcha o'quvchilarning id'lari (ro'yxat filtri uchun). */
  async getActiveFrozenStudentIds(): Promise<string[]> {
    const rows = await this.prisma.studentFreeze.findMany({
      where: { endDate: null, isDeleted: false },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    return rows.map((r) => r.studentId);
  }

  /**
   * Berilgan o'quvchilardan qaysilari HOZIR muzlatilgan.
   * `Map(studentId → { startDate, reason })`.
   */
  async getActiveFreezeMap(studentIds: string[]): Promise<Map<string, ActiveFreeze>> {
    if (!studentIds || studentIds.length === 0) return new Map();
    const rows = await this.prisma.studentFreeze.findMany({
      where: {
        studentId: { in: studentIds.map(String) },
        endDate: null,
        isDeleted: false,
      },
      select: { studentId: true, startDate: true, reason: true },
    });
    const map = new Map<string, ActiveFreeze>();
    for (const r of rows) map.set(String(r.studentId), r as ActiveFreeze);
    return map;
  }
}
