import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { GradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';
import { RatingService } from './rating.service.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { CoinModule } from '../coin/coin.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * BAHOLAR VA REYTING moduli.
 *
 * ⚠ `AttendanceModule` IMPORT QILINADI — reyting balining yarmi
 * davomat foizidan keladi (`getStudentSummary().attendanceRate`).
 * Uni QAYTA HISOBLASH ikkinchi (va darhol farq qiluvchi) davomat
 * ta'rifini tug'dirardi: bayramlar, muzlatishlar va imtiyozlar
 * `AttendanceService` ichida hisobga olinadi.
 *
 * `CoinModule` — baho uchun tanga (rag'bat). U PUL YO'LIDA EMAS:
 * chaqiruv bloklamaydi va xatosi yutiladi, ya'ni tanga
 * hisoblanmagani uchun BAHO saqlanmay qolmaydi.
 *
 * `GradesService` EKSPORT qilinadi — o'rtacha ball boshqa modullarga
 * ham kerak bo'lishi mumkin (reyting shu yerda, ichkarida).
 */
@Module({
  imports: [AttendanceModule, CoinModule],
  controllers: [GradesController],
  providers: [GradesService, RatingService],
  exports: [GradesService, RatingService],
})
export class GradesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(GradesController);
  }
}
