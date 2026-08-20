import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';

/**
 * ROLLAR — FAQAT O'QISH (Faza 2).
 *
 * ⚠⚠ MUTATSIYA METODLARI ATAYLAB YO'Q ⚠⚠
 *
 * Rol/ruxsat YOZISH amallari (create, update, freeze, delete,
 * `PATCH /users/:id/role`) Faza 2 davomida FAQAT Express'da qoladi —
 * bu kelishilgan YAGONA YOZUVCHI modeli.
 *
 * SABABI: `PermissionService` dagi rol keshi JARAYONGA XOS (5 daqiqa).
 * Ikki jarayon ham yozsa, birida qilingan o'zgarish ikkinchisining
 * keshini INVALIDATSIYA QILMASDI va u 5 daqiqagacha eski ruxsatlar
 * bilan ishlab turardi. Bitta yozuvchi bo'lsa bunday holat UMUMAN
 * yuzaga kelmaydi — shuning uchun Redis ham, pub/sub ham, TTL
 * qisqartirish ham KERAK EMAS.
 *
 * Bu VAQTINCHA cheklov: Express olib tashlangach mutatsiyalar shu yerga
 * ko'chadi va `invalidateRoleCache()` yana yetarli bo'ladi.
 */

/** `roles.service.js` dagi `shapeRole` ning aynan ko'chirmasi. */
const shapeRole = (doc: any, userCount = 0) => ({
  id: String(doc.id),
  _id: String(doc.id),
  value: doc.value,
  label: doc.label,
  description: doc.description || '',
  roleType: doc.roleType,
  defaultPath: doc.defaultPath,
  isSystem: Boolean(doc.isSystem),
  isFrozen: Boolean(doc.isFrozen),
  frozenAt: doc.frozenAt || null,
  frozenReason: doc.frozenReason || '',
  permissionIds: (doc.permissions || []).map((p: any) => String(p?.id ? p.id : p)),
  permissionKeys: (doc.permissions || []).filter((p: any) => p?.key).map((p: any) => p.key),
  userCount,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

@Injectable()
export class RolesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { select: { id: true, key: true } } },
      orderBy: [{ isSystem: 'desc' }, { label: 'asc' }],
    });

    // Har rolda nechta foydalanuvchi borligini BITTA groupBy bilan olamiz.
    const counts = await this.prisma.user.groupBy({
      by: ['role'],
      where: { isDeleted: false },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.role, c._count._all]));

    return roles.map((r) => shapeRole(r, countMap.get(r.value) || 0));
  }

  async getByValue(value: string) {
    const role = await this.prisma.role.findUnique({
      where: { value },
      include: { permissions: { select: { id: true, key: true } } },
    });
    if (!role) throw new ApiError(404, 'Rol topilmadi');
    const userCount = await this.prisma.user.count({
      where: { role: value, isDeleted: false },
    });
    return shapeRole(role, userCount);
  }
}
