import { Injectable, Logger, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ModuleFeaturesService } from './module-features.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IXTIYORIY MODUL — "bor bo'lsa ishlat, bo'lmasa o'tib ket".
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── MUAMMO ──
 *
 * `AuthModule` beshta biznes modulini import qilardi: `groups`,
 * `attendance`, `student-freeze`, `teacher-salary` (→ `finance`) va
 * `opening-balance`. Ularning hech biri autentifikatsiya uchun ZARUR
 * emas — hammasi PROFILNI BOYITISH yoki `registerUser` ning IXTIYORIY
 * yon ta'siri.
 *
 * Lekin `@Module({ imports: [...] })` grafigi buni "auth ularga tayanadi"
 * deb o'qirdi. `auth` esa qulflangan (hech qachon o'chmaydi), ya'ni
 * to'siq mantig'i o'sha beshtasini ham HECH QACHON o'chirilmaydigan qilib
 * qo'ygan edi — 46 ta o'chirgichdan beshtasi amalda o'lik edi.
 *
 * ── YECHIM ──
 *
 * Bog'liqlikni STATIK importdan ISH VAQTIDAGI so'rovga aylantiramiz va
 * har so'rovni TARIF BILAN tekshiramiz.
 *
 * ⚠ ENG MUHIM QISM — TEKSHIRUV, IMPORTNI OLIB TASHLASH EMAS.
 *
 * `ModuleRef` bilan servisni shundoq ham olish mumkin edi (hamma modul
 * `AppModule` da ro'yxatdan o'tgan), lekin o'shanda grafik YOLG'ON
 * gapirardi: import yo'q, tayanch esa bor. Natijada `attendance`
 * o'chirilgan tenantda `/auth/me` javobida davomat xulosasi BARIBIR
 * chiqardi — ya'ni pul to'lanmagan bo'lim ma'lumoti oqib ketardi.
 *
 * Tarif tekshiruvi shu bo'shliqni yopadi: modul o'chiq bo'lsa `null`
 * qaytadi va chaqiruvchi o'sha maydonni bo'sh qoldiradi. Endi "auth
 * ularga tayanmaydi" degan gap HAQIQAT, ya'ni grafikdan importni olib
 * tashlash to'g'ri.
 *
 * ── ⚠ QAYERDA ISHLATILMAYDI ──
 *
 * Bu HAQIQIY tayanch bog'liqlik uchun EMAS. Agar modul B ning asosiy
 * ishi A siz bajarilmasa (masalan `attendance` → `notifications`), u
 * oddiy `imports` bo'lib qolishi SHART: grafik uni to'siq sifatida
 * ko'rsatishi kerak, aks holda panel jimgina buzuq konfiguratsiyani
 * saqlab qo'yardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class OptionalModuleService {
  private readonly logger = new Logger('OptionalModule');

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly features: ModuleFeaturesService,
  ) {}

  /** Modul tarifda ochiqmi (servisni olmasdan tekshirish). */
  enabled(featureKey: string): boolean {
    return this.features.isModuleEnabled(featureKey);
  }

  /**
   * Modul ochiq bo'lsa servisni qaytaradi, aks holda `null`.
   *
   * ⚠ `strict: false` — servis BOSHQA modulda yashaydi va bu yerda u
   * import qilinmagan. Aynan shu narsa grafikni toza saqlaydi.
   *
   * ⚠ Topilmasa ham `null`: modul ilovadan butunlay olib tashlangan
   * bo'lishi mumkin (masalan alohida nashr). Chaqiruvchi ikkala holatni
   * bir xil ishlashi kerak.
   */
  get<T>(featureKey: string, token: Type<T>): T | null {
    if (!this.enabled(featureKey)) return null;

    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      this.logger.warn(
        `"${featureKey}" tarifda ochiq, lekin ${token.name} DI konteynerda topilmadi`,
      );
      return null;
    }
  }
}
