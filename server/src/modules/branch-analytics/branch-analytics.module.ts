import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BranchAnalyticsRoomsController } from './branch-analytics.controller.js';
import { RoomUtilizationService } from './room-utilization.service.js';
import { BranchPnlService } from './branch-pnl.service.js';
import { BranchMetricsService } from './branch-metrics.service.js';
import { BranchSalesService } from './branch-sales.service.js';
import { BranchTeachersService } from './branch-teachers.service.js';
import { BranchAlertsService } from './branch-alerts.service.js';
import { StudentTransferService } from './student-transfer.service.js';
import { RoomOccupancyService } from '../../common/helpers/room-occupancy.js';
import { JournalModule } from '../journal/journal.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * FILIAL TAHLILI — 11/11 marshrut.
 *
 * ⚠ `RoomOccupancyService` EKSPORT QILINADI: `financeAnalytics` SHU
 * servisdan foydalanadi. Nusxa ko'chirilsa ikki ekran bir xil xona
 * uchun ikki xil foiz ko'rsatadi (bu allaqachon yuz bergan: 103% va 100%).
 *
 * ⚠ `JournalModule` — `alerts` (muvozanat, kassa qoldig'i) va
 * `student-transfer` (filiallararo depozit yozuvi) uchun. AYLANA
 * YO'Q: jurnal bu modulga tayanmaydi.
 *
 * ⚠ MOLIYA MODULLARI (`finance`, `teacher-salary`) IMPORT
 * QILINMAYDI — bu yerdagi hamma hisob JURNALDAN va Prisma'dan
 * to'g'ridan-to'g'ri o'qiydi (`branchPnl.collect`). Formula
 * NUSXALANMAYDI: `teachers` daromadni `BranchPnlService.pnl` NING
 * O'ZIDAN oladi.
 */
@Module({
  imports: [JournalModule],
  controllers: [BranchAnalyticsRoomsController],
  providers: [
    RoomUtilizationService,
    RoomOccupancyService,
    BranchPnlService,
    BranchMetricsService,
    BranchSalesService,
    BranchTeachersService,
    BranchAlertsService,
    StudentTransferService,
  ],
  exports: [RoomUtilizationService, RoomOccupancyService, BranchPnlService],
})
export class BranchAnalyticsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(BranchAnalyticsRoomsController);
  }
}
