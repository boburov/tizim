import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLE_TYPES } from '../constants/permissions.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * `server/src/helpers/credentialScope.helper.js` NING KO'CHIRMASI.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PAROL ENDPOINT'LARI UCHUN ALOHIDA (QAT'IYROQ) KO'LAM.
 *
 * MUAMMO: `branches.view_all` — HISOBOT ruxsati ("barcha filiallarni
 * birdan ko'rish"). `assertTargetInScope` esa uni `canSeeAll` deb qabul
 * qiladi va tekshiruvni BUTUNLAY o'tkazib yuboradi.
 *
 * Natijada `branches.view_all` + `system.admin_access` juftligi bo'lgan
 * rol BOSHQA filial xodimining PAROLINI ochiq matnda o'qiy olardi
 * (parollar ochiq saqlanadi). `tests/privEscalation.test.js` shuni
 * ushlagan edi.
 *
 * YECHIM: parol uchun `view_all` YETARLI EMAS. Faqat HAQIQIY owner
 * (`roleType === "owner"`) cheklovsiz; qolgan hamma — jumladan
 * admin_access + view_all bo'lgan rol ham — faqat O'ZIGA BIRIKTIRILGAN
 * filiallar doirasida.
 *
 * ⚠ `allowedBranchIds` ATAYLAB QAYTARILMAYDI va req'dan OLINMAYDI:
 * `resolveBranchScope()` `view_all` bo'lsa u ro'yxatga BARCHA filialni
 * soladi — ya'ni bayroqni o'chirish yetarli emas edi, ro'yxatda baribir
 * begona filial turardi. Shuning uchun aktyorning HAQIQIY filiallari
 * bazadan QAYTA O'QILADI.
 * ═══════════════════════════════════════════════════════════════════════
 */

export interface CredentialActor {
  actorId: string | null;
  isOwner: boolean;
}

export const credentialScope = (req: AuthenticatedRequest): CredentialActor => ({
  actorId: req?.user?.id ? String(req.user.id) : null,
  isOwner:
    req?.role?.roleType === ROLE_TYPES.OWNER ||
    req?.baseRole?.roleType === ROLE_TYPES.OWNER,
});

@Injectable()
export class CredentialScopeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Aktyorning HAQIQIY filiallari (homeBranchId + branchAssignments).
   * `req.allowedBranchIds` ATAYLAB ishlatilmaydi — yuqoridagi izohga qarang.
   */
  async actorBranchIds(actorId: string | null): Promise<string[]> {
    if (!actorId) return [];
    const actor = await this.prisma.user.findUnique({
      where: { id: String(actorId) },
      select: {
        homeBranchId: true,
        branchAssignments: { select: { branchId: true } },
      },
    });
    if (!actor) return [];
    const ids = new Set<string>();
    if (actor.homeBranchId) ids.add(String(actor.homeBranchId));
    for (const a of actor.branchAssignments || []) {
      if (a?.branchId) ids.add(String(a.branchId));
    }
    return [...ids];
  }
}
