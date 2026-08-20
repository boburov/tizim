import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  getActiveBranchId,
  getAllowedBranchIds,
  canSeeAllBranches,
  branchFilter,
  userBranchCondition,
} from '../../common/als/branch-context.js';

/**
 * ALS KUZATUVCHISI — servis QATLAMIDAN o'qiydi.
 *
 * ⚠ NEGA SERVISDAN, KONTROLLERDAN EMAS: aynan shu joy isbotlanishi kerak.
 * Kontroller middleware'ga yaqin; servis esa qo'riqchi, pipe va bir necha
 * `await` chegarasidan KEYIN ishlaydi. ALS shu yerda ham tirik bo'lsa —
 * u butun so'rov hayot sikli bo'ylab saqlanadi degani.
 */
@Injectable()
export class DiagService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async observeScope() {
    // ATAYLAB haqiqiy DB borish-kelishi: `await` chegarasi ALS ni
    // yo'qotmasligini tekshiradi (eng ko'p uchraydigan buzilish shu).
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      branchId: getActiveBranchId(),
      allowedBranchIds: getAllowedBranchIds(),
      canSeeAllBranches: canSeeAllBranches(),
      // Servis qatlami HAQIQATDA nima ishlatadi:
      branchFilter: branchFilter(),
      userBranchCondition: userBranchCondition(),
    };
  }
}
