import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { CoursePriceService } from './course-price.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * KURSLAR moduli — katalog + narx matritsasi.
 *
 * `CoursePriceService` EKSPORT qilinadi: `groups` va moliya modullari
 * guruh tarifini undan meros oladi (`resolveGroupPrice`).
 */
@Module({
  controllers: [CoursesController],
  providers: [CoursesService, CoursePriceService],
  exports: [CoursesService, CoursePriceService],
})
export class CoursesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(CoursesController);
  }
}
