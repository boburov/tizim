import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CUSTOMER_AUDIENCE } from '../../customers/customer-auth.service.js';

/** Panelga kira oladigan ishlab chiquvchi rollari. */
const DEVELOPER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'VIEWER']);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAQAT ISHLAB CHIQUVCHI ADMIN.
 *
 * `JwtAuthGuard` DAN KEYIN turadi va uning ustiga BITTA aniq savol qo'yadi:
 * "bu identifikator bizning xodimimizmi?" — chunki tijorat konfiguratsiyasi
 * (kim qancha to'laydi, qancha filial ochishi mumkin) MIJOZGA umuman
 * ko'rinmasligi kerak.
 *
 * ── NEGA ALOHIDA GUARD, `RolesGuard` YETMAYDIMI ──
 *
 * `RolesGuard` — "qaysi rol nima qila oladi" savoli. Bu esa "kim umuman
 * kirishi mumkin" savoli, ya'ni undan BIR POG'ONA PASTDA. Ikkalasini bitta
 * joyga qo'shish keyinchalik `@Roles(...)` ni yozishni unutgan yangi
 * marshrutni JIMGINA ochib qo'yardi.
 *
 * ── ⚠ MIJOZ TOKENI ATAYLAB VA OSHKORA RAD ETILADI ──
 *
 * Admin va mijoz tokenlari BIR XIL `JWT_ACCESS_SECRET` bilan imzolanadi;
 * ularni faqat `aud` maydoni ajratadi. Hozir mijoz tokenida `role` yo'q va
 * `JwtStrategy` uni shu sababdan rad etadi — lekin bu TASODIFIY himoya:
 * mijoz payload'iga bir kun `role` qo'shilsa, tekshiruvsiz joy jimgina
 * ochilardi. Shuning uchun bu yerda shart OCHIQ yozilgan.
 *
 * Tenant ilovasining o'z rollari (owner/"super admin", direktor va h.k.)
 * bu yerga UMUMAN yeta olmaydi: ular boshqa servis, boshqa baza va boshqa
 * imzo kaliti bilan ishlaydi va admin serverda hisobi yo'q.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class DeveloperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & { user?: { role?: string; aud?: string } }
    >();
    const user = req.user;

    if (!user) throw new ForbiddenException('Ruxsat yetarli emas');

    if ((user as { aud?: string }).aud === CUSTOMER_AUDIENCE) {
      throw new ForbiddenException(
        'Tijorat sozlamalari mijoz kabinetidan boshqarilmaydi',
      );
    }

    if (!user.role || !DEVELOPER_ROLES.has(user.role)) {
      throw new ForbiddenException('Ruxsat yetarli emas');
    }

    return true;
  }
}
