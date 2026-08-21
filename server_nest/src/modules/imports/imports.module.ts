import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ImportsController } from './imports.controller.js';
import { ImportRegistryService } from './import-registry.service.js';
import { ImportEngineService } from './import-engine.service.js';
import { ImportTemplateService } from './import-template.service.js';
import { ImportQueueService } from './import-queue.service.js';
import { SheetReaderService } from './sheet-reader.service.js';
import { UserImportBaseService } from './importers/user-import-base.service.js';
import { StudentsImporter } from './importers/students.importer.js';
import { TeachersImporter } from './importers/teachers.importer.js';
import { StaffImporter } from './importers/staff.importer.js';
import { StudentPaymentsImporter } from './importers/student-payments.importer.js';
import { TeacherSalaryPaymentsImporter } from './importers/teacher-salary-payments.importer.js';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { UsersModule } from '../users/users.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { TeacherSalaryModule } from '../teacher-salary/teacher-salary.module.js';
import { StaffPayrollModule } from '../staff-payroll/staff-payroll.module.js';
import { OpeningBalanceModule } from '../opening-balance/opening-balance.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * EXCEL IMPORT — 11/11 marshrut.
 *
 * ⚠ IMPORTERLAR MAVJUD SERVISLARNI CHAQIRADI, o'z yozuvini yozmaydi:
 * `registerUser`, `createStaff`, `addStudent`, `transaction.create`,
 * `salaryTransaction.create`, `openingBalance.create`,
 * `staffCompensation.setCompensation`. Shuning uchun barcha qoidalar
 * (filial ko'lami, tasdiq limiti, jurnal yozuvi, idempotentlik) AYNAN
 * UI oqimidagidek qo'llanadi — import "YON ESHIK" bo'lib qolmaydi.
 *
 * ⚠ AYLANA YO'Q: bu modulni HECH KIM import qilmaydi (u eng yuqori
 * qatlam), shuning uchun hamma bog'liqlik OCHIQ import bilan olinadi.
 */
@Module({
  imports: [
    AuthModule,
    GroupsModule,
    UsersModule,
    FinanceModule,
    TeacherSalaryModule,
    StaffPayrollModule,
    OpeningBalanceModule,
  ],
  controllers: [ImportsController],
  providers: [
    SheetReaderService,
    ImportEngineService,
    ImportTemplateService,
    ImportQueueService,
    ImportRegistryService,
    UserImportBaseService,
    StudentsImporter,
    TeachersImporter,
    StaffImporter,
    StudentPaymentsImporter,
    TeacherSalaryPaymentsImporter,
  ],
  exports: [ImportRegistryService, ImportEngineService, ImportQueueService],
})
export class ImportsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ImportsController);
  }
}
