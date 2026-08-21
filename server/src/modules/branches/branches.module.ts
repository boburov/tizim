import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  BranchesController,
  BranchesWriteController,
} from './branches.controller.js';
import { BranchesService } from './branches.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * ⚠ KONTROLLER TARTIBI: `BranchesWriteController` (`POST /`,
 * `PATCH /:id`, `DELETE /:id`) va `BranchesController` bir xil prefiksda
 * turadi, lekin METODLARI boshqacha — to'qnashuv yo'q. Baribir yozish
 * kontrolleri OLDIN keladi, chunki `PATCH`/`DELETE` faqat u yerda.
 */
@Module({
  controllers: [BranchesWriteController, BranchesController],
  providers: [BranchesService],
})
export class BranchesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .forRoutes(BranchesWriteController, BranchesController);
  }
}
