import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BranchAnalyticsRoomsController } from './branch-analytics.controller.js';
import { RoomUtilizationService } from './room-utilization.service.js';
import { RoomOccupancyService } from '../../common/helpers/room-occupancy.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * FILIAL TAHLILI — xona bandligi qismi (1 marshrut).
 *
 * ⚠ `RoomOccupancyService` EKSPORT QILINADI: `financeAnalytics`
 * ko'chirilganda u SHU servisdan foydalanishi SHART. Nusxa ko'chirilsa
 * ikki ekran bir xil xona uchun ikki xil foiz ko'rsatadi (bu allaqachon
 * yuz bergan: 103% va 100%).
 */
@Module({
  controllers: [BranchAnalyticsRoomsController],
  providers: [RoomUtilizationService, RoomOccupancyService],
  exports: [RoomUtilizationService, RoomOccupancyService],
})
export class BranchAnalyticsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(BranchAnalyticsRoomsController);
  }
}
