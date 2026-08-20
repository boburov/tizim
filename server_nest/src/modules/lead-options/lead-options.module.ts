import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LeadOptionsController } from './lead-options.controller.js';
import { LeadOptionsService } from './lead-options.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

@Module({
  controllers: [LeadOptionsController],
  providers: [LeadOptionsService],
  exports: [LeadOptionsService],
})
export class LeadOptionsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(LeadOptionsController);
  }
}
