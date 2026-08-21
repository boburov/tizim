import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ID → NOM YECHUVCHI (`revenue.service.js` dagi `nameResolvers`).
 *
 * ⚠ NEGA ALOHIDA SERVIS: Express'da bu oddiy obyekt edi va
 * `profitability.service.js` uni `revenue.service.js` dan IMPORT
 * qilardi. NestJS'da servis servisdan "obyekt import qilish" DI ni
 * chetlab o'tardi, shuning uchun u inject qilinadigan qatlamga
 * ko'chirildi. NUSXA KO'CHIRILMADI — ikkala servis SHU BITTASINI
 * ishlatadi, aks holda "Guruh A" bir ekranda nom bilan, boshqasida
 * bo'sh qator bo'lib chiqardi.
 *
 * Har biri BITTA `IN (...)` so'rovi — kesim qatorlari bo'yicha N+1 YO'Q.
 */
@Injectable()
export class NameResolverService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private readonly resolvers: Record<string, (ids: string[]) => Promise<Map<string, string>>> = {
    branch: async (ids) => {
      const rows = await this.prisma.branch.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r.name]));
    },
    course: async (ids) => {
      const rows = await this.prisma.course.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      });
      return new Map(rows.map((r) => [r.id, r.title]));
    },
    teacher: async (ids) => this.personNames(ids),
    /**
     * ⚠ `student` DAN FARQI BOR — bu yerda `username` ZAXIRASI YO'Q.
     *
     * `receivables.service.js` o'quvchi qatorini aynan SHU shaklda
     * yechadi (ism + familiya), `revenue.service.js` esa `student`
     * yechuvchisi orqali `username` ga tushadi. Ikkalasi BOSHQA-BOSHQA
     * xatti-harakat va ular BIRLASHTIRILMADI: ismi bo'sh o'quvchida
     * bitta ekran login ko'rsatib, boshqasi bo'sh qator ko'rsatadi —
     * bu MAVJUD holat va ko'chirish uni o'zgartirmaydi.
     */
    personName: async (ids) => this.personNames(ids),
    group: async (ids) => {
      const rows = await this.prisma.group.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r.name]));
    },
    room: async (ids) => {
      const rows = await this.prisma.room.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r.name]));
    },
    // O'QUVCHI — zanjirning eng chuqur nomlangan bo'g'ini.
    //
    // Talab 34: "Guruh A" ni bosgan odam O'QUVCHILAR ro'yxatini ko'rishi
    // kerak. Ilgari bu kesim YO'Q edi va zanjir guruhda uzilardi:
    // qarzdorlik bo'yicha o'quvchi ro'yxati bor edi
    // (`receivables/by/student`), lekin "kim TO'LADI" degan savolga
    // javob yo'q edi — faqat "kim to'lamadi".
    student: async (ids) => {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, username: true },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.username || '',
        ]),
      );
    },
  };

  private async personNames(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName || ''}`.trim()]));
  }

  has(kind: string): boolean {
    return Boolean(this.resolvers[kind]);
  }

  /** Noma'lum kesimda BO'SH Map — chaqiruvchi `|| ""` bilan davom etadi. */
  async resolve(kind: string, ids: string[]): Promise<Map<string, string>> {
    const fn = this.resolvers[kind];
    if (!fn || !ids.length) return new Map();
    return fn(ids);
  }
}
