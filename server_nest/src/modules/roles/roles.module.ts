import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * AUTH MIDDLEWARE SHU YERDA ULANADI — global emas.
 *
 * Express `requireAuth` ni har bir route ALOHIDA ulaydi. Shu naqsh
 * saqlanadi: modul o'z marshrutlariga o'zi ulaydi, ya'ni
 * "autentifikatsiya bor joyda filial ko'lami ham DOIM bor" qoidasi
 * modul darajasida ko'rinib turadi.
 */
@Module({
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(RolesController);
  }
}
