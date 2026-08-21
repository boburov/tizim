import { MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { TeacherGroupPeriodService } from './teacher-group-period.service.js';
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';
import { ApprovalExecutorRegistry } from '../../common/approvals/approval-executor.registry.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * GURUHLAR moduli.
 *
 * Ikkala servis ham EKSPORT qilinadi: `attendance`, `grades`,
 * `student-freeze` va `buildUserProfile` ularga tayanadi.
 *
 * ⚠ `TeacherSalaryModule` IMPORT QILINMAYDI — u O'ZI `GroupsModule`
 * ni import qiladi va teskari yo'nalish modul AYLANASINI tug'dirardi.
 * Maosh qayta hisobi `TeacherGroupPeriodService` ichida `ModuleRef`
 * bilan KECH bog'lanadi (Express ham o'sha joyda dinamik `import()`
 * ishlatadi).
 */
@Module({
  imports: [ExpenseApprovalsModule],
  controllers: [GroupsController],
  providers: [GroupsService, TeacherGroupPeriodService],
  exports: [GroupsService, TeacherGroupPeriodService],
})
export class GroupsModule implements NestModule, OnModuleInit {
  constructor(
    private readonly executors: ApprovalExecutorRegistry,
    private readonly periods: TeacherGroupPeriodService,
  ) {}

  /**
   * MAOSH STAVKASI tasdig'ining BAJARUVCHISI.
   *
   * Bog'liqlik AYLANMA (bu modul `ExpenseApprovalsModule` ni import
   * qiladi, approvals esa tasdiqlangan so'rovni bajarish uchun shu
   * servisni chaqirishi kerak). Express dinamik import bilan hal
   * qiladi; NestJS'da ekvivalenti — registry orqali KECH BOG'LASH.
   */
  onModuleInit(): void {
    this.executors.register(APPROVAL_KINDS.SALARY_TERMS, (a) =>
      this.periods.executeApprovedSalaryTerms(a),
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(GroupsController);
  }
}
