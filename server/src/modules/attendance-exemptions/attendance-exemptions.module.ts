import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MembershipService } from './membership.service.js';
import { AttendanceExemptionsController } from './attendance-exemptions.controller.js';
import { AttendanceExemptionsService } from './attendance-exemptions.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/** DAVOMATDAN OZOD DAVRLARI (FAZA 6). */
@Module({
  controllers: [AttendanceExemptionsController],
  // ⚠ `MembershipService` ilgari `CommonModule` da global provider edi.
  // U faqat SHU modulda ishlatiladi — shuning uchun kod ham,
  // ro'yxatga olish ham shu yerga ko'chdi.
  providers: [AttendanceExemptionsService, MembershipService],
  exports: [AttendanceExemptionsService],
})
export class AttendanceExemptionsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(AttendanceExemptionsController);
  }
}
