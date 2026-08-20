import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(SearchController);
  }
}
