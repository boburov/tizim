import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toUtcMidnight } from '../../common/utils/date.js';

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

  // ═══════════════════════════════════════════════════════════════════
  // DAVOMAT INTEGRATSIYASI — `helpers/studentFreeze.helper.js` dan.
  //
  // ⚠ FAQAT DAVOMATGA TEGISHLI IKKI FUNKSIYA KO'CHIRILDI.
  // `loadFreezeWindows` / `loadFreezeWindowsByStudent` / `isFrozenOn`
  // TO'LOV proratsiyasi uchun va ular `finance` moduli bilan BIRGA
  // ko'chadi — hozir ko'chirilsa ishlatilmaydigan nusxa qolib, vaqt
  // o'tib asl nusxadan ajralib ketardi.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Muzlatish oynasini davomat "exemption" shakliga aylantiradi.
   *
   * ⚠⚠ CHEGARA SEMANTIKASI BIR KUNGA FARQ QILADI ⚠⚠
   *   muzlatish : `[startDate, endDate)` — endDate EXCLUSIVE
   *               (chiqarish kuni ARTIQ muzlatilmagan)
   *   exemption : `[startDate, endDate]` — endDate INCLUSIVE
   *
   * Shu sababli oxirgi muzlatilgan kun = `endDate - 1 kun`. Ayirilmasa
   * o'quvchi muzlatishdan CHIQQAN kuni ham "exempt" bo'lib qolardi va
   * o'sha kun davomat foizidan tushib ketardi.
   *
   * `daysOfWeek: []` = HAMMA kun (to'liq muzlatish).
   */
  freezeToExemption(f: { studentId: string; startDate: Date; endDate: Date | null }) {
    const DAY_MS = 24 * 60 * 60 * 1000;
    return {
      // Prisma ustuni `studentId`; chaqiruvchilar (attendance) eski
      // `student` nomini o'qiydi — IKKALASI ham beriladi.
      studentId: f.studentId,
      student: f.studentId,
      isActive: true,
      startDate: f.startDate,
      endDate: f.endDate
        ? new Date(toUtcMidnight(f.endDate).getTime() - DAY_MS)
        : null,
      daysOfWeek: [] as string[],
      __source: 'freeze',
    };
  }

  /**
   * HAQIQIY exemption'lar + muzlatishdan olingan PSEUDO-exemption'lar.
   *
   * ⚠ BO'SH RO'YXAT = "HECH KIM" (fail-closed), `undefined` EMAS.
   * `{ studentId: { in: [] } }` hech nima qaytaradi; filtrni tushirib
   * qoldirish esa BUTUN jadvalni qaytarardi — ya'ni bir o'quvchining
   * muzlatishi hammaga qo'llanardi.
   */
  async loadExemptionsWithFreezes(studentIds: string | string[]) {
    const ids = (Array.isArray(studentIds) ? studentIds : [studentIds])
      .filter(Boolean)
      .map(String);
    const where =
      ids.length === 1 ? { studentId: ids[0] } : { studentId: { in: ids } };

    const [exemptions, freezes] = await Promise.all([
      this.prisma.attendanceExemption.findMany({
        where: { ...where, isActive: true },
      }),
      this.prisma.studentFreeze.findMany({ where: { ...where, isDeleted: false } }),
    ]);

    // Haqiqiy exemption'da ham `student` taxallusi kerak — chaqiruvchi
    // `ex.student` bo'yicha guruhlaydi.
    const normalized = exemptions.map((e) => ({ ...e, student: e.studentId }));
    return [
      ...normalized,
      ...freezes.map((f) => this.freezeToExemption(f)),
    ] as Record<string, any>[];
  }

}
