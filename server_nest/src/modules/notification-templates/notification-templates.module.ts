import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NotificationTemplatesController } from './notification-templates.controller.js';
import { NotificationTemplatesService } from './notification-templates.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/** Shablonlar — o'qish har kimga, yozish owner + `notification_templates.manage`. */
@Module({
  controllers: [NotificationTemplatesController],
  providers: [NotificationTemplatesService],
  exports: [NotificationTemplatesService],
})
export class NotificationTemplatesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(NotificationTemplatesController);
  }
}
