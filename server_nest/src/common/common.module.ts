import { Global, Module } from '@nestjs/common';
import { PermissionService } from './rbac/permission.service.js';
import { BranchAccessService } from './rbac/branch-access.service.js';
import { CredentialScopeService } from './rbac/credential-scope.js';
import { RolesHelperService } from './rbac/roles.helper.js';
import { StudentCompletionService } from './helpers/student-completion.service.js';
import { ApprovalExecutorRegistry } from './approvals/approval-executor.registry.js';
import { MembershipService } from './helpers/membership.service.js';
import { CorrelationCacheService } from './helpers/correlation-cache.service.js';
import { LessonCancellationService } from './helpers/lesson-cancellation.service.js';
import { UserRelationsService } from './helpers/user-relations.service.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { AllPermissionsGuard } from './guards/all-permissions.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PermissionOrSelfGuard } from './guards/permission-or-self.guard.js';
import {
  GroupAccessGuard,
  StudentAccessGuard,
} from './guards/attendance-scope.guard.js';
import { AuthMiddleware } from '../middleware/auth.middleware.js';

/**
 * Umumiy infratuzilma — RBAC servislari, qo'riqchilar va auth middleware.
 *
 * `@Global()`: bu qismlar deyarli har bir biznes modulida kerak bo'ladi.
 *
 * ⚠ QO'RIQCHILAR GLOBAL RO'YXATDAN O'TKAZILMAYDI (`APP_GUARD` YO'Q).
 *
 * Express'da avtorizatsiya HAR BIR ROUTE'da ochiq yoziladi
 * (`requirePermission(...)`). Global guard bu shaklni buzardi: dekorator
 * qo'yilmagan marshrut JIMGINA "ruxsat berilgan" bo'lib qolardi va buni
 * hech narsa ko'rsatmasdi. Shuning uchun qo'riqchilar kontroller yoki
 * metod darajasida `@UseGuards(...)` bilan ochiq ulanadi — xuddi
 * Express'dagidek ko'rinadigan tarzda.
 *
 * ⚠ AUTH MIDDLEWARE HAM SHU YERDA GLOBAL EMAS.
 * Express `requireAuth` ni har bir route ALOHIDA ulaydi (373 marta).
 * Uni `forRoutes('*')` bilan global qilish `/api/health` ni ham yopardi
 * va Faza 1 dagi tekshiruvni buzardi. Har bir ko'chirilgan modul uni
 * O'Z `configure()` metodida, o'z yo'llariga ulaydi — ya'ni
 * "autentifikatsiya bor joyda ko'lam ham DOIM bor" qoidasi saqlanadi.
 */
@Global()
@Module({
  providers: [
    PermissionService,
    BranchAccessService,
    CredentialScopeService,
    RolesHelperService,
    StudentCompletionService,
    ApprovalExecutorRegistry,
    MembershipService,
    CorrelationCacheService,
    LessonCancellationService,
    UserRelationsService,
    PermissionsGuard,
    AllPermissionsGuard,
    RolesGuard,
    PermissionOrSelfGuard,
    GroupAccessGuard,
    StudentAccessGuard,
    AuthMiddleware,
  ],
  exports: [
    PermissionService,
    BranchAccessService,
    CredentialScopeService,
    RolesHelperService,
    StudentCompletionService,
    ApprovalExecutorRegistry,
    MembershipService,
    CorrelationCacheService,
    LessonCancellationService,
    UserRelationsService,
    PermissionsGuard,
    AllPermissionsGuard,
    RolesGuard,
    PermissionOrSelfGuard,
    GroupAccessGuard,
    StudentAccessGuard,
    AuthMiddleware,
  ],
})
export class CommonModule {}
