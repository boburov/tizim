import { Controller, Get, Req } from '@nestjs/common';
import { DiagService } from './diag.service.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * VAQTINCHA — FAZA 2 TEKSHIRUV SKAFOLDI. CUTOVER'DAN OLDIN O'CHIRILADI.
 *
 * `GET /api/_diag/scope` — filial ko'lamini SERVIS QATLAMIDAN qaytaradi.
 *
 * NEGA KERAK: ALS kontekstining butun NestJS hayot sikli (middleware →
 * guard → pipe → handler → servis → `await` DB) bo'ylab saqlanishini
 * BEVOSITA kuzatishning boshqa yo'li yo'q. Bilvosita alomatlar
 * ("so'rov ishladi") kontekst yo'qolganda ham yashil bo'lardi — chunki
 * kontekstsiz `branchFilter()` bo'sh obyekt qaytaradi va so'rov
 * MUVAFFAQIYATLI, lekin FILTRSIZ bajariladi.
 *
 * XAVFSIZLIK:
 *   • autentifikatsiya TALAB QILINADI (modulda middleware ulangan);
 *   • faqat production BO'LMAGAN muhitda ro'yxatdan o'tadi;
 *   • YANGI ma'lumot oshkor qilmaydi — bu ayni ko'lam klientga
 *     allaqachon `/auth/me` orqali qaytadi.
 * ═══════════════════════════════════════════════════════════════════════
 */
@Controller('_diag')
export class DiagController {
  constructor(private readonly diag: DiagService) {}

  @Get('scope')
  async scope(@Req() req: AuthenticatedRequest) {
    const observed = await this.diag.observeScope();
    return {
      success: true,
      data: {
        // Middleware `req` ga nima yozdi.
        request: {
          userId: req.user?.id ?? null,
          role: req.role?.value ?? null,
          baseRole: req.baseRole?.value ?? null,
          branchId: req.branchId ?? null,
          allowedBranchIds: req.allowedBranchIds ?? [],
          canSeeAllBranches: Boolean(req.canSeeAllBranches),
          permissionCount: req.permissions?.length ?? 0,
        },
        // Servis qatlami ALS'dan nima KO'RDI (ikkalasi mos kelishi SHART).
        observedInService: observed,
      },
    };
  }
}
