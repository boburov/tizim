import { Module } from '@nestjs/common';
import { StudentFreezeService } from './student-freeze.service.js';

/**
 * ⚠ KONTROLLERSIZ — ATAYLAB. Muzlatish MARSHRUTLARI (`/api/student-freezes`)
 * hamon Express'da: ular to'lov proratsiyasiga tegadi va `finance` bilan
 * birga (FAZA 4) ko'chadi. Bu modul hozircha faqat `users` ro'yxatiga
 * kerak bo'lgan ikki O'QISH metodini beradi.
 */
@Module({
  providers: [StudentFreezeService],
  exports: [StudentFreezeService],
})
export class StudentFreezeModule {}
