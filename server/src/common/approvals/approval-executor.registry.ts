import { Injectable, Logger } from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASDIQ BAJARUVCHILARI RO'YXATI (registry).
 *
 * ── NEGA REGISTRY, TO'G'RIDAN-TO'G'RI INJEKSIYA EMAS ──
 *
 * Bog'liqlik AYLANMA: amal servislari (`deposits`, `teacher-salary`,
 * `expenses`...) `ExpenseApprovalsService` ni chaqiradi — limit
 * tekshiruvi va so'rov yaratish uchun. Tasdiqlash esa TESKARI yo'nalishda
 * ishlaydi: approvals o'sha servislarni chaqirishi kerak.
 *
 * Express buni DINAMIK IMPORT bilan hal qiladi (`await import(...)`
 * bajarish payti, modul yuklanishida emas) — fayl boshidagi izohda aynan
 * shu yozilgan: "Sikldan qochish uchun dinamik import ishlatiladi".
 *
 * NestJS'da buning aniq ekvivalenti — KECH BOG'LASH: modul o'z
 * bajaruvchisini ishga tushishda RO'YXATGA OLADI, approvals esa faqat
 * ro'yxatni biladi. `forwardRef` ham ishlardi, lekin u har bir juftlik
 * uchun alohida yozilishi kerak va aylanani YO'Q QILMAYDI — faqat
 * kechiktiradi.
 *
 * ⚠ XULQ-ATVOR O'ZGARMAYDI: bu DI muammosining yechimi, biznes
 * qoidasining emas. Bajaruvchi funksiyalari Express'dagi bilan aynan
 * bir xil imzoga ega: `(approval) => Promise<result>`.
 *
 * ── ⚠ QISMAN TO'LDIRILGAN — VA BU XAVFSIZ ──
 *
 * Express'da 10 ta tur uchun 10 ta bajaruvchi bor. NestJS'da hozircha
 * faqat ko'chirilgan modullar o'zini ro'yxatga oladi. Yetishmagan tur
 * uchun `has()` `false` qaytaradi va chaqiruvchi HOLATNI UMUMAN
 * O'ZGARTIRMASDAN rad etadi — batafsil sabab `approve()` izohida.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export type ApprovalExecutor = (approval: any) => Promise<any>;

@Injectable()
export class ApprovalExecutorRegistry {
  private readonly logger = new Logger('ApprovalExecutors');
  private readonly executors = new Map<string, ApprovalExecutor>();

  /**
   * Modul o'z bajaruvchisini ro'yxatga oladi (odatda `onModuleInit` da).
   *
   * ⚠ IKKINCHI RO'YXATDAN O'TISH XATO: bir tur uchun ikki bajaruvchi
   * bo'lsa qaysi biri ishlashi yuklash tartibiga bog'liq bo'lardi —
   * ya'ni pul qayerga yozilishi tasodifga qolardi.
   */
  register(kind: string, fn: ApprovalExecutor): void {
    if (this.executors.has(kind)) {
      throw new Error(
        `Tasdiq bajaruvchisi ikki marta ro'yxatdan o'tdi: ${kind}`,
      );
    }
    this.executors.set(kind, fn);
    this.logger.log(`bajaruvchi ro'yxatga olindi: ${kind}`);
  }

  has(kind: string): boolean {
    return this.executors.has(kind);
  }

  get(kind: string): ApprovalExecutor | undefined {
    return this.executors.get(kind);
  }

  /** Ko'chirilgan turlar ro'yxati — diagnostika va test uchun. */
  kinds(): string[] {
    return [...this.executors.keys()].sort();
  }
}
