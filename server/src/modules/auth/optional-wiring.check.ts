import { Injectable, Logger, type OnApplicationBootstrap, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { GroupsService } from '../groups/groups.service.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { StudentFreezeService } from '../student-freeze/student-freeze.service.js';
import { TeacherCompensationService } from '../teacher-salary/teacher-compensation.service.js';
import { OpeningBalanceService } from '../opening-balance/opening-balance.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IXTIYORIY BOG'LIQLIKLAR ULANGANMI — ISHGA TUSHISHDA TEKSHIRILADI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── QANDAY XATODAN SAQLAYDI ──
 *
 * `AuthModule` endi bu beshta modulni `imports` bilan olmaydi
 * (`auth.module.ts` dagi izohga qarang) — servislar ish vaqtida
 * `ModuleRef` orqali so'raladi. Bu esa KOMPILYATOR HIMOYASINI yo'qotadi:
 * modul `AppModule` dan olib tashlansa yoki servis eksporti o'zgarsa,
 * TypeScript hech narsa demaydi.
 *
 * Ishlab turgan tizimda bu shunday ko'rinardi: modul tarifda OCHIQ,
 * lekin `moduleRef.get` yiqiladi → `null` qaytadi → o'quvchi profilida
 * guruhlar va davomat BO'SH chiqadi. Xato yo'q, log yo'q, 500 yo'q —
 * shunchaki ma'lumot yo'qolgan. Mijoz "guruhlarim ko'rinmayapti" deb
 * qo'ng'iroq qiladi va sababni topish uchun bir kun ketadi.
 *
 * ── NEGA ISHGA TUSHISHDA, HAR CHAQIRUVDA EMAS ──
 *
 * Bu KONFIGURATSIYA xatosi, ish vaqtidagi holat emas: u yo bor, yo yo'q.
 * Boot paytida yiqilish xavfsiz — jarayon hali so'rov qabul qilmaydi va
 * PM2 loglarida sabab aniq turadi. Har chaqiruvda tekshirish esa
 * `/auth/me` ni butunlay yiqitardi, ya'ni bitta noto'g'ri simdan butun
 * tizim to'xtardi.
 *
 * ⚠ TARIF HOLATI TEKSHIRILMAYDI. Modul o'chirilgan bo'lishi MUTLAQO
 * normal — biz servis DI konteynerda BORLIGINI tekshiramiz, tarifda
 * ochiqligini emas.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const OPTIONAL_DEPENDENCIES: ReadonlyArray<{
  feature: string;
  token: Type<unknown>;
  usedBy: string;
}> = Object.freeze([
  { feature: 'groups', token: GroupsService, usedBy: 'profil: guruhlar' },
  { feature: 'attendance', token: AttendanceService, usedBy: 'profil: davomat xulosasi' },
  { feature: 'student-freeze', token: StudentFreezeService, usedBy: 'profil: muzlatish' },
  { feature: 'finance', token: TeacherCompensationService, usedBy: 'registerUser: maosh stavkasi' },
  { feature: 'opening-balance', token: OpeningBalanceService, usedBy: "registerUser: boshlang'ich qoldiq" },
]);

@Injectable()
export class OptionalWiringCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger('OptionalWiring');

  constructor(private readonly moduleRef: ModuleRef) {}

  onApplicationBootstrap(): void {
    const missing: string[] = [];

    for (const dep of OPTIONAL_DEPENDENCIES) {
      try {
        this.moduleRef.get(dep.token, { strict: false });
      } catch {
        missing.push(`${dep.token.name} (${dep.feature} — ${dep.usedBy})`);
      }
    }

    if (missing.length) {
      throw new Error(
        "AuthModule ning ixtiyoriy bog'liqliklari DI konteynerda topilmadi:\n" +
          missing.map((m) => `  • ${m}`).join('\n') +
          "\n\nSabab odatda bitta: modul `AppModule` dan olib tashlangan yoki " +
          'servis `exports` dan chiqib qolgan. Tuzatilmasa profil maydonlari ' +
          "JIMGINA bo'sh chiqadi.",
      );
    }

    this.logger.log(
      `${OPTIONAL_DEPENDENCIES.length} ta ixtiyoriy bog'liqlik joyida`,
    );
  }
}
