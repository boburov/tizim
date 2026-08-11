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

  // ==========================================================================
  // ADMIN KO'RINISHI
  //
  // Yuqoridagi metodlar mijozning O'ZI uchun (customerId tokendan keladi).
  // Bulari esa admin paneli uchun: hamma mijoz, ularning loyihalari va
  // obuna holati bir joyda.
  // ==========================================================================

  /**
   * Admin uchun mijozlar ro'yxati.
   *
   * Har mijoz bilan birga loyihalari va obuna holati qaytadi — panelda
   * sinov berish uchun aynan shu ma'lumot kerak, alohida so'rovsiz.
   */
  async adminList(search?: string) {
    const q = search?.trim();

    const customers = await this.prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
              { companyName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        companyName: true,
        emailVerified: true,
        isActive: true,
        avatarUrl: true,
        createdAt: true,
        googleId: true,
        tenants: {
          where: { status: { not: 'DELETED' } },
          orderBy: { createdAt: 'desc' },
          select: TENANT_CARD_SELECT,
        },
      },
    });

    return customers.map(({ googleId, tenants, ...c }) => ({
      ...c,
      googleLinked: Boolean(googleId),
      tenants: tenants.map(decorateTenant),
      tenantCount: tenants.length,
    }));
  }

  /** Bitta mijozning to'liq kartasi (loyihalar + to'lovlar tarixi). */
  async adminFindOne(id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        companyName: true,
        emailVerified: true,
        isActive: true,
        avatarUrl: true,
        createdAt: true,
        googleId: true,
        tenants: {
          orderBy: { createdAt: 'desc' },
          select: TENANT_CARD_SELECT,
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            amount: true,
            currency: true,
            provider: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Mijoz topilmadi');

    const { googleId, tenants, ...rest } = c;
    return {
      ...rest,
      googleLinked: Boolean(googleId),
      tenants: tenants.map(decorateTenant),
    };
  }

  /**
   * Hisobni bloklash/ochish.
   *
   * Bu FAQAT kabinetga kirishni to'xtatadi — ishlab turgan loyihalarga
   * tegmaydi. Loyihani to'xtatish alohida amal (obuna bo'limi), chunki
   * "mijoz kabinetga kira olmasin" va "o'quv markaz ishlamasin" butunlay
   * boshqa-boshqa qarorlar.
   */
  async adminSetActive(id: string, isActive: boolean) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Mijoz topilmadi');

    return this.prisma.customer.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });
  }

  /**
   * Egasiz loyihalar — super admin o'zi yaratganlari (customerId null).
   * Ular ham sinov/to'xtatish amallariga muhtoj, shuning uchun
   * Foydalanuvchilar sahifasida alohida guruh bo'lib ko'rinadi.
   */
  async adminUnassignedTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { customerId: null, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      select: TENANT_CARD_SELECT,
    });
    return tenants.map(decorateTenant);
  }
}

/** Panelda loyiha kartasi uchun kerak bo'ladigan maydonlar. */
const TENANT_CARD_SELECT = {
  id: true,
  name: true,
  domain: true,
  status: true,
  brandColor: true,
  createdAt: true,
  suspendedAt: true,
  suspendReason: true,
  lastHeartbeatAt: true,
  subscription: {
    select: {
      id: true,
      status: true,
      startedAt: true,
      currentPeriodEnd: true,
      trialDays: true,
      trialGrantedBy: true,
      trialGrantedAt: true,
      trialNote: true,
      plan: { select: { key: true, name: true, price: true, currency: true } },
    },
  },
} as const;

type TenantCard = {
  subscription: {
    status: string;
    currentPeriodEnd: Date | null;
  } | null;
};

/**
 * Obunaning HAQIQIY holatini hisoblab qo'shadi.
 *
 * Bazadagi status muddat o'tishi bilan o'zi o'zgarmaydi — uni kuzatuvchi
 * (scheduler) 15 daqiqada bir marta yangilaydi. Panel esa darrov to'g'ri
 * ko'rsatishi kerak, shuning uchun qolgan kun shu yerda sanaladi.
 */
function decorateTenant<T extends TenantCard>(t: T) {
  const sub = t.subscription;
  const end = sub?.currentPeriodEnd ?? null;
  const daysLeft = end
    ? Math.ceil((end.getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    ...t,
    subscription: sub
      ? {
          ...sub,
          expired: Boolean(end && end.getTime() <= Date.now()),
          daysLeft,
        }
      : null,
  };
}
