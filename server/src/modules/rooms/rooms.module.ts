import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * XONALAR moduli. Barcha 5 marshrut `requireAuth` ostida — Express'da ham
 * shunday, ochiq (auth'siz) yo'l YO'Q.
 */
@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(RoomsController);
  }
}
