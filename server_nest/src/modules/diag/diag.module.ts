import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DiagController } from './diag.controller.js';
import { DiagService } from './diag.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * VAQTINCHA modul (Faza 2 tekshiruvi). `AppModule` uni FAQAT
 * production bo'lmagan muhitda import qiladi.
 */
@Module({
  controllers: [DiagController],
  providers: [DiagService],
})
export class DiagModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(DiagController);
  }
}
