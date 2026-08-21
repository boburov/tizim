import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

/**
 * FIKR-MULOHAZA moduli.
 *
 * `NotificationsModule` — holat o'zgarganda muallifga xabar yuborish
 * uchun (`notifyFeedbackStatusChange`).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(FeedbackController);
  }
}
