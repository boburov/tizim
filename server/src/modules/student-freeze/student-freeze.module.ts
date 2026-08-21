import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { StudentFreezeController } from './student-freeze.controller.js';
import { StudentFreezeService } from './student-freeze.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * O'QUVCHI MUZLATISHI — 3/3 marshrut.
 *
 * ⚠ `FinanceModule` IMPORT QILINMAYDI: u O'ZI shu modulni import qiladi
 * (muzlatilgan kunda o'quvchi TO'LAMAYDI). To'lovlarni qayta hisoblash
 * `ModuleRef` orqali KECH bog'lanadi — batafsil izoh servis faylida.
 */
@Module({
  controllers: [StudentFreezeController],
  providers: [StudentFreezeService],
  exports: [StudentFreezeService],
})
export class StudentFreezeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(StudentFreezeController);
  }
}
