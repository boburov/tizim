import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Admin Postgres bazasini tozalash. Faqat provisioning metadata'si o'chadi:
 * tenantlar va 2-darajali admin userlar. SystemTemplate'lar saqlanadi, aks holda
 * tozalashdan keyin yangi loyiha yaratib bo'lmaydi.
 *
 * MUHIM: bu VPS'dagi tenant MongoDB bazalari, PM2 processlari va nginx
 * configlariga tegmaydi — ular yetim (orphan) bo'lib qoladi va kerak bo'lsa
 * qo'lda tozalanadi.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Tozalashdan oldin nima o'chishini ko'rsatish uchun statistika. */
  async stats() {
    const [tenants, adminUsers, templates] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.adminUser.count(),
      this.prisma.systemTemplate.count(),
    ]);
    return {
      willDelete: { tenants, adminUsers },
      willKeep: { systemTemplates: templates },
    };
  }

  /** Hammasini o'chiradi (SystemTemplate va .env super admin bundan mustasno). */
  async resetDatabase(performedBy: string) {
    // Tenant'lar SystemTemplate'ga bog'langan — avval ular o'chadi.
    const [tenants, adminUsers] = await this.prisma.$transaction([
      this.prisma.tenant.deleteMany({}),
      this.prisma.adminUser.deleteMany({}),
    ]);

    this.logger.warn(
      `⚠️  Baza tozalandi (${performedBy}): ${tenants.count} tenant, ` +
        `${adminUsers.count} admin user o'chirildi`,
    );

    return {
      ok: true,
      deleted: { tenants: tenants.count, adminUsers: adminUsers.count },
      note:
        "Tenantlarning MongoDB bazalari, PM2 processlari va nginx configlari " +
        "VPS'da saqlanib qoldi — kerak bo'lsa qo'lda tozalang.",
    };
  }
}
