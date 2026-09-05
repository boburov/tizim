import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A'ZOLIK TEKSHIRUVLARI — `helpers/membership.helper.js` KO'CHIRMASI.
 *
 * ⚠ HAR SHART OCHIQ `...Id` BILAN YOZILGAN. Mongoose'da bog'lanish
 * maydonlari `student` / `group` deb atalardi va ichida ObjectId
 * turardi; Prisma'da esa ular `studentId` / `groupId`, `student` /
 * `group` esa RELATION. `where: { student: id }` Prisma'da XATO
 * BERMAYDI — u relation bo'yicha filtr izlaydi va JIMGINA boshqa
 * natija qaytaradi.
 *
 * ⚠ `isDeleted: false` FILTRI HAR JOYDA SHART: soft-delete qilingan
 * a'zolik "faol" deb sanalmasligi kerak, aks holda o'chirilgan
 * o'quvchi tekshiruvdan o'tib ketardi.
 *
 * `tx` — Prisma tranzaksiya klienti (Mongoose sessiyasi o'rniga).
 * Berilmasa oddiy klient ishlatiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
type Db = { groupMembership: PrismaService['groupMembership'] };

@Injectable()
export class MembershipService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private db(tx?: Db): Db {
    return tx || this.prisma;
  }

  /** O'quvchining FAOL (`leftAt = null`) guruh a'zoligi bormi. */
  async hasActiveGroup(studentId: string, tx?: Db): Promise<boolean> {
    const found = await this.db(tx).groupMembership.findFirst({
      where: { studentId: String(studentId), leftAt: null, isDeleted: false },
      select: { id: true },
    });
    return Boolean(found);
  }

  /** O'quvchi AYNAN shu guruhda faolmi (`leftAt = null`). */
  async isActiveInGroup(studentId: string, groupId: string, tx?: Db): Promise<boolean> {
    const found = await this.db(tx).groupMembership.findFirst({
      where: {
        studentId: String(studentId),
        groupId: String(groupId),
        leftAt: null,
        isDeleted: false,
      },
      select: { id: true },
    });
    return Boolean(found);
  }

  /** Faol guruh bo'lmasa amalni rad etadi (to'lov, chegirma, ozod davri...). */
  async ensureActiveGroup(studentId: string, tx?: Db): Promise<void> {
    if (!(await this.hasActiveGroup(studentId, tx))) {
      throw new ApiError(
        400,
        "O'quvchi hech qaysi guruhda emas. Avval o'quvchini guruhga qo'shing.",
      );
    }
  }

  /**
   * O'qituvchi shu o'quvchiga ega guruhlardan biriga biriktirilganmi.
   *
   * ⚠ TARIXIY A'ZOLIK HAM HISOBGA OLINADI (`leftAt` bo'lgani ham):
   * ozod davri yoki baho tuzatishi guruhdan chiqqan o'quvchi uchun ham
   * kiritilishi mumkin. `leftAt: null` qo'shilsa o'qituvchi o'z sobiq
   * o'quvchisining yozuvini tahrirlay olmay qolardi.
   *
   * PRISMA: `Group.teachers` — ko'p-ko'pga, shuning uchun
   * `teachers: { some: { id } }` (Mongo'dagi `{ teachers: id }` massiv
   * ichidan qidirishning ekvivalenti).
   */
  async ensureTeacherOwnsStudent(teacherId: string, studentId: string): Promise<void> {
    const membership = await this.prisma.groupMembership.findFirst({
      where: {
        studentId: String(studentId),
        isDeleted: false,
        group: { teachers: { some: { id: String(teacherId) } } },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas");
    }
  }
}
