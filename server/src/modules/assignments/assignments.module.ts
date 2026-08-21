import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { JobsModule } from '../../jobs/jobs.module.js';
import { BotModule } from '../../bot/bot.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { UploadAttachmentMiddleware } from '../../common/middleware/upload-attachment.js';
import { uploadLimiter } from '../../common/middleware/rate-limit.js';
import { ApiError } from '../../common/errors/api-error.js';
import { hasAnyPermission } from '../../common/rbac/permission.service.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';

/**
 * `requirePermission(ASSIGNMENTS_SEND)` NING MIDDLEWARE SHAKLI.
 *
 * ⚠ NEGA QO'RIQCHI YETARLI EMAS: NestJS qo'riqchilari middleware'dan
 * KEYIN ishlaydi. Faqat `PermissionsGuard` ga tayanilsa, ruxsatsiz
 * foydalanuvchining 5 MB fayli AVVAL xotiraga o'qilib, keyin 403
 * qaytarilardi. Express zanjirida `requirePermission` multer'dan
 * OLDIN turadi va aynan shu sababdan — izohda ham shunday yozilgan.
 *
 * Xato matni `PermissionsGuard` bilan AYNAN bir xil, ya'ni javob
 * paritetı buzilmaydi (qaysi qatlam to'xtatgani tashqaridan
 * ko'rinmaydi).
 */
const sendPermissionMiddleware = (
  req: Request, _res: Response, next: NextFunction,
): void => {
  const r = req as unknown as AuthenticatedRequest;
  if (!r.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
  if (!hasAnyPermission(r.permissions, [PERMISSIONS.ASSIGNMENTS_SEND])) {
    return next(new ApiError(403, 'Ruxsat etilmagan'));
  }
  next();
};

/**
 * VAZIFALAR moduli.
 *
 * ⚠ BOG'LIQLIKLAR OCHIQ IMPORT QILINADI — HECH BIRI TAKRORLANMAGAN:
 *   • `StorageModule` → kvota, `saveBuffer`, `readFile`, `removeFile`
 *   • `JobsModule`    → `SchedulerService` (PRODUSER: ishni navbatga
 *                        qo'yadi, uni Express'ning ishchisi oladi)
 *   • `BotModule`     → `AssignmentDeliverService` (inline zaxira yo'l)
 *
 * ⚠ `assignment.deliver` JOB HANDLER'I BU YERDA RO'YXATDAN
 * O'TKAZILMAYDI. Ishchi rolini hozircha Express bajaradi
 * (`NEST_WORKER_JOBS`); ikkala jarayon ham bir xil navbatni
 * iste'mol qilsa, bitta vazifa IKKI MARTA yetkazilishi mumkin edi.
 */
@Module({
  imports: [StorageModule, JobsModule, BotModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, UploadAttachmentMiddleware],
  exports: [AssignmentsService],
})
export class AssignmentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(AssignmentsController);

    // ⚠ ZANJIR TARTIBI EXPRESS BILAN AYNAN BIR XIL:
    //   requirePermission → uploadLimiter → uploadAttachment
    // `uploadLimiter` tekshiruvlardan KEYIN, lekin tanani o'qishdan
    // OLDIN: chegaraga yetgan so'rov 5 MB ni xotiraga yutmasdan
    // to'xtaydi.
    consumer
      .apply(sendPermissionMiddleware, uploadLimiter, UploadAttachmentMiddleware)
      .forRoutes({ path: 'assignments', method: RequestMethod.POST });
  }
}
