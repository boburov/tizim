import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AttendanceExemptionsController } from './attendance-exemptions.controller.js';
import { AttendanceExemptionsService } from './attendance-exemptions.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/** DAVOMATDAN OZOD DAVRLARI (FAZA 6). */
@Module({
  controllers: [AttendanceExemptionsController],
  providers: [AttendanceExemptionsService],
  exports: [AttendanceExemptionsService],
})
export class AttendanceExemptionsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(AttendanceExemptionsController);
  }
}
