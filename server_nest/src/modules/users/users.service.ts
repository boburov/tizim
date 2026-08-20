import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { assertTargetInScope } from '../../common/rbac/branch-access.service.js';
import {
  CredentialScopeService,
  type CredentialActor,
} from '../../common/rbac/credential-scope.js';

/**
 * FOYDALANUVCHILAR — Faza 2.2 da FAQAT `getPassword`.
 *
 * NEGA AYNAN SHU METOD BIRINCHI: u tizimdagi ENG QAT'IY yo'l va
 * `credentialScope` ni haqiqiy sharoitda tekshiradi. Qolgan 13 endpoint
 * Faza 2.5 da.
 */

const SCOPE_INCLUDE = {
  branchAssignments: { select: { branchId: true, role: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly credentials: CredentialScopeService,
  ) {}

  /**
   * `users.service.js` dagi `getPassword` ning aynan ko'chirmasi.
   *
   * ⚠ PAROLLAR OCHIQ MATNDA SAQLANADI — bu endpoint mavjud qiymatni
   * QAYTARADI (u parolni "tiklamaydi"). Shuning uchun chegara ikki
   * qatlamli: `users.password` ruxsati (kontroller) VA filial ko'lami
   * (shu yer).
   */
  async getPassword(id: string, actor: CredentialActor) {
    // Global `omit` parolni har qanday boshqa so'rovdan chetlatadi;
    // FAQAT shu yer uni ataylab so'raydi.
    const user = await this.prisma.user.findUnique({
      where: { id: String(id) },
      omit: { passwordHash: false },
      include: SCOPE_INCLUDE,
    });
    if (!user) throw new ApiError(404, 'Foydalanuvchi topilmadi');
    if (user.role === ROLES.OWNER) {
      throw new ApiError(403, "Owner parolini ko'rib bo'lmaydi");
    }

    // ═══════════════════════════════════════════════════════════════════
    // FILIAL HIMOYASI — ENG MUHIM TEKSHIRUV.
    //
    // `requireRole(OWNER)` uchinchi bosqichda `system.admin_access`
    // borlarni ham o'tkazadi — ya'ni filial direktori shu endpoint
    // orqali BOSHQA filial xodimining parolini o'qiy olardi.
    //
    // ⚠ `req.allowedBranchIds` / `canSeeAllBranches` ATAYLAB
    // ISHLATILMAYDI: `branches.view_all` IKKALASINI ham kengaytiradi va
    // zaiflik aynan shundan kelib chiqadi. Faqat HAQIQIY owner
    // (`roleType === "owner"`) cheklovsiz o'qiydi; qolganlar uchun
    // aktyorning filiallari BAZADAN QAYTA o'qiladi.
    // ═══════════════════════════════════════════════════════════════════
    const actorBranchIds = await this.credentials.actorBranchIds(actor?.actorId ?? null);
    assertTargetInScope(actorBranchIds, Boolean(actor?.isOwner), user as never);

    return { username: user.username, password: user.passwordHash || '' };
  }
}
