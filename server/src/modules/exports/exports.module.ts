import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ExportsController } from './exports.controller.js';
import { ExportRegistryService } from './export-registry.service.js';
import { ExportsService } from './exports.service.js';
import { XlsxWriterService } from './xlsx-writer.service.js';
import { UsersModule } from '../users/users.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * EXCEL EKSPORT — 2/2 marshrut.
 *
 * ⚠ `UsersModule` va `FinanceModule` OCHIQ import qilinadi: dataset'lar
 * MAVJUD `list()` servislarini chaqiradi va O'Z so'rovini YOZMAYDI —
 * aks holda filial filtri unutilib, eksport jimgina boshqa filial
 * ma'lumotini ochib qo'yardi.
 *
 * ⚠ `UsersModule` `UsersService` ni EKSPORT QILISHI SHART (u ilgari
 * faqat ichki edi) — shuning uchun o'sha modulga `exports` qo'shildi.
 */
@Module({
  imports: [UsersModule, FinanceModule],
  controllers: [ExportsController],
  providers: [ExportRegistryService, ExportsService, XlsxWriterService],
  exports: [ExportRegistryService, ExportsService, XlsxWriterService],
})
export class ExportsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ExportsController);
  }
}
