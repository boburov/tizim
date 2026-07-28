import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AssignPlanDto,
  CreateFeatureDto,
  CreatePlanDto,
  PlanFeatureValueDto,
  UpdateFeatureDto,
  UpdatePlanDto,
} from './dto/plan.dto.js';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  // ===================== FEATURES =====================

  listFeatures() {
    return this.prisma.feature.findMany({ orderBy: { key: 'asc' } });
  }

  async createFeature(dto: CreateFeatureDto) {
    const exists = await this.prisma.feature.findUnique({
      where: { key: dto.key },
    });
    if (exists) throw new ConflictException('Bu key band');
    return this.prisma.feature.create({ data: dto });
  }

  async updateFeature(id: string, dto: UpdateFeatureDto) {
    await this.mustFindFeature(id);
    return this.prisma.feature.update({ where: { id }, data: dto });
  }

  async removeFeature(id: string) {
    await this.mustFindFeature(id);
    // Tarifda ishlatilayotgan feature'ni o'chirish limitlarni buzadi
    const used = await this.prisma.planFeature.count({ where: { featureId: id } });
    if (used > 0) {
      throw new ConflictException(
        `Bu imkoniyat ${used} ta tarifda ishlatilmoqda — avval ulardan olib tashlang`,
      );
    }
    await this.prisma.feature.delete({ where: { id } });
    return { ok: true };
  }

  private async mustFindFeature(id: string) {
    const f = await this.prisma.feature.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Imkoniyat topilmadi');
    return f;
  }

  // ===================== PLANS =====================

  listPlans(onlyPublic = false) {
    return this.prisma.plan.findMany({
      where: onlyPublic ? { isActive: true, isPublic: true } : {},
      include: { features: { include: { feature: true } } },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
  }

  async findPlan(id: string) {
    const p = await this.prisma.plan.findUnique({
      where: { id },
      include: { features: { include: { feature: true } } },
    });
    if (!p) throw new NotFoundException('Tarif topilmadi');
    return p;
  }

  async createPlan(dto: CreatePlanDto) {
    const exists = await this.prisma.plan.findUnique({ where: { key: dto.key } });
    if (exists) throw new ConflictException('Bu key band');

    const featureRows = await this.resolveFeatures(dto.features);

    return this.prisma.plan.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: dto.currency ?? 'UZS',
        interval: dto.interval,
        trialDays: dto.trialDays ?? 0,
        sortOrder: dto.sortOrder ?? 0,
        isPublic: dto.isPublic ?? true,
        features: { create: featureRows },
      },
      include: { features: { include: { feature: true } } },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    await this.findPlan(id);

    // features berilgan bo'lsa — to'liq almashtiramiz (eskisini o'chirib qaytadan)
    const featureRows = dto.features
      ? await this.resolveFeatures(dto.features)
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (featureRows) {
        await tx.planFeature.deleteMany({ where: { planId: id } });
      }
      return tx.plan.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          currency: dto.currency,
          interval: dto.interval,
          trialDays: dto.trialDays,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
          isPublic: dto.isPublic,
          ...(featureRows ? { features: { create: featureRows } } : {}),
        },
        include: { features: { include: { feature: true } } },
      });
    });
  }

  async removePlan(id: string) {
    await this.findPlan(id);
    const subs = await this.prisma.subscription.count({ where: { planId: id } });
    if (subs > 0) {
      throw new ConflictException(
        `Bu tarifda ${subs} ta obuna bor — avval ularni boshqa tarifga o'tkazing`,
      );
    }
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }

  /** featureKey -> featureId ga aylantiradi va qiymatni tekshiradi. */
  private async resolveFeatures(items?: PlanFeatureValueDto[]) {
    if (!items?.length) return [];

    const keys = items.map((i) => i.featureKey);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) {
      throw new BadRequestException(`Takrorlangan imkoniyat: ${dupes.join(', ')}`);
    }

    const features = await this.prisma.feature.findMany({
      where: { key: { in: keys } },
    });
    const byKey = new Map(features.map((f) => [f.key, f]));

    return items.map((i) => {
      const f = byKey.get(i.featureKey);
      if (!f) throw new BadRequestException(`Imkoniyat topilmadi: ${i.featureKey}`);
      if (f.type === 'BOOLEAN' && i.value !== 0 && i.value !== 1) {
        throw new BadRequestException(
          `"${f.key}" BOOLEAN — qiymat 0 yoki 1 bo'lishi kerak`,
        );
      }
      return { featureId: f.id, value: i.value };
    });
  }

  // ===================== SUBSCRIPTION =====================

  /** Tenantga tarif biriktiradi (yoki mavjudini almashtiradi). */
  async assignPlan(tenantId: string, dto: AssignPlanDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, customerId: true },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');
    if (tenant.status === 'DELETED') {
      throw new ConflictException("O'chirilgan tenantga tarif biriktirib bo'lmaydi");
    }

    const plan = await this.prisma.plan.findUnique({
      where: { key: dto.planKey },
    });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Tarif topilmadi yoki faol emas');
    }

    const periodEnd = this.computePeriodEnd(plan.interval, dto.days);

    return this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: plan.id,
        customerId: tenant.customerId,
        status: plan.trialDays > 0 ? 'TRIALING' : 'ACTIVE',
        currentPeriodEnd: periodEnd,
      },
      update: {
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd,
        canceledAt: null,
      },
      include: { plan: true },
    });
  }

  /** LIFETIME uchun muddat yo'q (null). */
  private computePeriodEnd(
    interval: 'MONTHLY' | 'YEARLY' | 'LIFETIME',
    days?: number,
  ): Date | null {
    if (interval === 'LIFETIME') return null;
    const end = new Date();
    if (days) {
      end.setDate(end.getDate() + days);
    } else if (interval === 'YEARLY') {
      end.setFullYear(end.getFullYear() + 1);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    return end;
  }

  async cancelSubscription(tenantId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });
    if (!sub) throw new NotFoundException('Obuna topilmadi');
    return this.prisma.subscription.update({
      where: { tenantId },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
  }
}
