import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LessonCancellationsController } from './lesson-cancellations.controller.js';
import { LessonCancellationsService } from './lesson-cancellations.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { TeacherSalaryModule } from '../teacher-salary/teacher-salary.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * BEKOR QILINGAN DARSLAR — 3/3 marshrut.
 *
 * ⚠ `FinanceModule` va `TeacherSalaryModule` OCHIQ import qilinadi —
 * bu yerda AYLANA YO'Q: ularning HECH BIRI bu modulga tayanmaydi.
 * (Ular `common/helpers/lesson-cancellation.service.ts` dagi
 * `loadCancelledLessonKeys` ni ishlatadi, u esa GLOBAL `CommonModule`
 * da.) Shuning uchun `ModuleRef` bilan kech bog'lash SHART EMAS.
 */
@Module({
  imports: [FinanceModule, TeacherSalaryModule],
  controllers: [LessonCancellationsController],
  providers: [LessonCancellationsService],
  exports: [LessonCancellationsService],
})
export class LessonCancellationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(LessonCancellationsController);
  }
}
