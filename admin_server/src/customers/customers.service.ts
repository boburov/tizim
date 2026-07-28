import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { PlansService } from '../plans/plans.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { CreateTenantDto } from '../tenants/dto/create-tenant.dto.js';
import { UpdateProfileDto } from './dto/customer-auth.dto.js';

/** Bitta mijoz yarata oladigan maksimal loyiha soni (spam himoyasi). */
const MAX_TENANTS_PER_CUSTOMER = Number(
  process.env.MAX_TENANTS_PER_CUSTOMER || 5,
);

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly plans: PlansService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async profile(customerId: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        companyName: true,
        emailVerified: true,
        avatarUrl: true,
        createdAt: true,
        // Parol hash'ining O'ZI qaytarilmaydi — faqat bor-yo'qligi kerak.
        passwordHash: true,
        googleId: true,
      },
    });
    if (!c) throw new NotFoundException('Mijoz topilmadi');

    // Hash'ni javobdan olib tashlaymiz, o'rniga ikkita bayroq qaytaramiz:
    // frontend shularga qarab "parol o'zgartirish" / "Google ulangan" ni
    // ko'rsatadi.
    const { passwordHash, googleId, ...rest } = c;
    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
      googleLinked: Boolean(googleId),
    };
  }

  updateProfile(customerId: string, dto: UpdateProfileDto) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        companyName: dto.companyName,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        companyName: true,
      },
    });
  }

  /** Mijozning o'z loyihalari. */
  async myTenants(customerId: string) {
    return this.prisma.tenant.findMany({
      where: { customerId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        domain: true,
        status: true,
        brandColor: true,
        logoUrl: true,
        serverIp: true,
        lastHeartbeatAt: true,
        failureReason: true,
        createdAt: true,
        systemTemplate: { select: { name: true, key: true } },
        subscription: {
          select: {
            status: true,
            currentPeriodEnd: true,
            plan: { select: { key: true, name: true, price: true } },
          },
        },
      },
    });
  }

  /** Mijozning bitta loyihasi — egalik tekshiriladi. */
  async myTenant(customerId: string, tenantId: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        systemTemplate: { select: { name: true, key: true } },
        subscription: { include: { plan: true } },
      },
    });
    if (!t || t.customerId !== customerId) {
      // Boshqa mijoz loyihasi borligini ham oshkor qilmaymiz
      throw new NotFoundException('Loyiha topilmadi');
    }
    return t;
  }

  /** Mijoz loyihasining usage/limit holati. */
  async myTenantUsage(customerId: string, tenantId: string) {
    await this.myTenant(customerId, tenantId); // egalik tekshiruvi
    return this.entitlements.forTenant(tenantId);
  }

  /**
   * Mijoz o'zi uchun yangi loyiha yaratadi (self-service).
   * Tanlangan tarif ochiq (isPublic) bo'lishi shart.
   */
  async createTenant(
    customerId: string,
    dto: CreateTenantDto & { planKey?: string },
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, email: true, isActive: true, emailVerified: true },
    });
    if (!customer) throw new NotFoundException('Mijoz topilmadi');
    if (!customer.isActive) throw new ForbiddenException('Hisob bloklangan');
    if (!customer.emailVerified) {
      throw new ForbiddenException('Avval emailingizni tasdiqlang');
    }

    const count = await this.prisma.tenant.count({
      where: { customerId, status: { not: 'DELETED' } },
    });
    if (count >= MAX_TENANTS_PER_CUSTOMER) {
      throw new ForbiddenException(
        `Maksimum ${MAX_TENANTS_PER_CUSTOMER} ta loyiha yaratish mumkin`,
      );
    }

    // Tarifni tekshiramiz (berilgan bo'lsa) — yashirin tarifni tanlab bo'lmaydi
    if (dto.planKey) {
      const plan = await this.prisma.plan.findUnique({
        where: { key: dto.planKey },
      });
      if (!plan || !plan.isActive || !plan.isPublic) {
        throw new BadRequestException('Tarif mavjud emas');
      }
    }

    const tenant = await this.tenants.create(dto, customer.email, customerId);

    // Tarif tanlangan bo'lsa darrov biriktiramiz
    if (dto.planKey) {
      await this.plans.assignPlan(tenant.id, { planKey: dto.planKey });
    }

    return tenant;
  }

  /** Mijoz o'z loyihasini o'chiradi. */
  async removeTenant(customerId: string, tenantId: string, confirmDomain: string) {
    await this.myTenant(customerId, tenantId); // egalik tekshiruvi
    return this.tenants.remove(tenantId, confirmDomain);
  }

  /** Client panelda ko'rinadigan ochiq tariflar. */
  publicPlans() {
    return this.plans.listPlans(true);
  }
}
