import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `modules/archiveReasons/services/archiveReasons.service.js` DAGI
 * `logAction` NING KO'CHIRMASI — VAQTINCHALIK KO'PRIK.
 *
 * ── NEGA SHU YERDA, `modules/archive-reasons` DA EMAS ──
 *
 * `archiveReasons` moduli (6 marshrut, FAZA 3) hali ko'chirilmagan va u
 * BOSHQA ish to'lqiniga tegishli. Lekin `POST /users/:id/restore`
 * O'QUVCHI nishonida arxiv jurnaliga YOZADI — bu yon ta'sirni tashlab
 * ketish "Chiqib ketish tahlili" hisobotini jimgina buzardi: o'quvchi
 * qaytarilgani qayd etilmay, hisobotda "arxivda" bo'lib qolaverardi.
 *
 * Ya'ni tanlov "modulga tegmaslik" bilan "xulq-atvorni saqlash"
 * o'rtasida emas — YOZUV MODULNING MARSHRUTIGA umuman tegmaydi, faqat
 * bitta jadvalga bitta qator qo'shadi.
 *
 * ⚠ `archiveReasons` KO'CHIRILGANDA: bu fayl O'CHIRILADI va chaqiruvchi
 * o'sha modulning servisiga ulanadi. Aks holda ikkita manba paydo
 * bo'ladi va ular muqarrar bir-biridan uzoqlashadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class ArchiveLogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Arxivlash/qaytarish izini yozadi.
   *
   * ⚠ `action` — Postgres ENUM (`ArchiveAction`), Mongo'dagi erkin satr
   * emas. Tur shu yerda toraytiriladi, aks holda noto'g'ri qiymat faqat
   * ishga tushganda, tranzaksiya ichida ko'rinardi.
   *
   * `reasonId` topilmasa (o'chirilgan sabab) yozuv BARIBIR yaratiladi —
   * faqat sabab bo'sh qoladi. Express aynan shunday qiladi: amalning
   * o'zi sababdan muhimroq.
   */
  async logAction({
    user,
    action,
    reasonId,
    by,
  }: {
    user: string;
    action: 'archive' | 'restore';
    reasonId?: string | null;
    by?: string | null;
  }): Promise<void> {
    let reasonRel: string | null = null;
    let reasonTitle = '';
    if (reasonId) {
      const r = await this.prisma.archiveReason.findUnique({
        where: { id: String(reasonId) },
        select: { id: true, title: true },
      });
      if (r) {
        reasonRel = r.id;
        reasonTitle = r.title;
      }
    }
    await this.prisma.archiveLog.create({
      data: {
        userId: String(user),
        action,
        reasonId: reasonRel,
        reasonTitle,
        performedById: by ? String(by) : null,
      },
    });
  }
}
