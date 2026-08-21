import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FeedbackTypesController } from './feedback-types.controller.js';
import { FeedbackTypesService } from './feedback-types.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

@Module({
  controllers: [FeedbackTypesController],
  providers: [FeedbackTypesService],
  exports: [FeedbackTypesService],
})
export class FeedbackTypesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(FeedbackTypesController);
  }
}
