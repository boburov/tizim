import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { GrantTrialDto } from './dto/subscription.dto.js';

/**
 * Muddat tugagandan keyin beriladigan qo'shimcha muhlat (soat).
 *
 * Standart 0 — ya'ni muddat tugagan zahoti to'xtatiladi. Bank o'tkazmasi
 * kechikadigan mijozlar uchun .env dan 24-48 qo'yish mumkin.
 */
const GRACE_HOURS = Number(process.env.SUBSCRIPTION_GRACE_HOURS || 0);

/**
 * Avtomatik to'xtatishni butunlay o'chirish kaliti.
 *
 * NEGA kerak: agar biror sabab bilan (noto'g'ri sana, migratsiya xatosi)
 * tekshiruv noto'g'ri ishlay boshlasa, kodga tegmasdan `false` qo'yib
 * hamma mijozni bir zumda saqlab qolish mumkin.
 */
const AUTO_SUSPEND =
  (process.env.SUBSCRIPTION_AUTOSUSPEND || 'true').toLowerCase() !== 'false';

/** To'xtatilgan tenantda `suspendReason` shu bilan boshlansa — avtomatik. */
export const AUTO_SUSPEND_REASON = "Obuna muddati tugadi";

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
  ) {}

  // ======================= BEPUL SINOV =======================

  /**
   * Tenantga bepul sinov beradi. FAQAT admin chaqiradi — mijoz o'zi sinov
   * ololmaydi (self-service oqimida bunday endpoint yo'q).
   *
   * Sinov = obunaning TRIALING holati + `currentPeriodEnd`. Ya'ni muddat
   * tugashini kuzatadigan mexanizm bitta: to'langan obuna ham, sinov ham
   * aynan bir xil yo'l bilan tekshiriladi va tugaydi.
   */
  async grantTrial(tenantId: string, dto: GrantTrialDto, adminEmail?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        domain: true,
        status: true,
        customerId: true,
        subscription: { include: { plan: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');
    if (tenant.status === 'DELETED' || tenant.status === 'DEPROVISIONING') {
      throw new ConflictException("O'chirilgan loyihaga sinov berib bo'lmaydi");
    }

    const plan = await this.resolveTrialPlan(
      dto.planKey,
      tenant.subscription?.planId,
    );

    const now = new Date();
    // Sinov HAR DOIM bugundan boshlanadi. Mavjud muddat ustiga qo'shilsa,
    // "7 kunlik sinov" aslida 37 kun bo'lib ketardi.
    const endsAt = new Date(now);
    endsAt.setDate(endsAt.getDate() + dto.days);

    const subscription = await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: plan.id,
        customerId: tenant.customerId,
        status: 'TRIALING',
        startedAt: now,
        currentPeriodEnd: endsAt,
        trialDays: dto.days,
        trialGrantedBy: adminEmail ?? null,
        trialGrantedAt: now,
        trialNote: dto.note ?? null,
      },
      update: {
        planId: plan.id,
        status: 'TRIALING',
        currentPeriodEnd: endsAt,
        canceledAt: null,
        trialDays: dto.days,
        trialGrantedBy: adminEmail ?? null,
        trialGrantedAt: now,
        trialNote: dto.note ?? null,
      },
      include: { plan: true },
    });

    // Muddat tugagani uchun to'xtatilgan bo'lsa — sinov uni qaytaradi.
    const resumed = await this.resumeIfAutoSuspended(tenant.id);

    this.logger.log(
      `Sinov berildi: ${tenant.domain} — ${dto.days} kun (${plan.key}), admin: ${adminEmail || 'noma\'lum'}`,
    );

    return {
      ok: true,
      trialDays: dto.days,
      endsAt,
      resumed,
      subscription,
    };
  }

  /**
   * Sinov uchun tarif tanlaydi.
   *
   * Tartib: aniq so'ralgan tarif → tenantning hozirgi tarifi → eng arzon
   * faol tarif. Oxirgisi "tarif tanlashni unutdik" holatida ham sinovni
   * ishlashga majbur qiladi — admin uchun bitta kamroq to'siq.
   */
  private async resolveTrialPlan(planKey?: string, currentPlanId?: string) {
    if (planKey) {
      const p = await this.prisma.plan.findUnique({ where: { key: planKey } });
      if (!p || !p.isActive) {
        throw new BadRequestException('Tarif topilmadi yoki faol emas');
      }
      return p;
    }

    if (currentPlanId) {
      const p = await this.prisma.plan.findUnique({
        where: { id: currentPlanId },
      });
      if (p?.isActive) return p;
    }

    const cheapest = await this.prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: [{ price: 'asc' }, { sortOrder: 'asc' }],
    });
    if (!cheapest) {
      throw new BadRequestException(
        "Bazada birorta faol tarif yo'q — avval tarif yarating (Tariflar sahifasi)",
      );
    }
    return cheapest;
  }

  // ======================= QO'LDA TO'XTATISH =======================

  /** Adminning qo'lda to'xtatishi (to'lov yo'q, suiiste'mol va h.k.). */
  async suspend(tenantId: string, reason?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, domain: true },
    });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');
    if (tenant.status === 'SUSPENDED') {
      return { ok: true, alreadySuspended: true };
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ConflictException(
        `Loyiha holati "${tenant.status}" — faqat ishlab turgan loyihani to'xtatish mumkin`,
      );
    }

    const done = await this.provisioning.suspend(
      tenantId,
      reason || "Admin qo'lda to'xtatdi",
    );
    if (!done) {
      throw new ConflictException(
        "To'xtatib bo'lmadi — VPS skripti xato qaytardi, loyiha sahifasidagi logni tekshiring",
      );
    }
    return { ok: true, status: 'SUSPENDED' };
  }

  /** To'xtatilgan loyihani qaytarish. */
  async resume(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, subscription: true },
    });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');
    if (tenant.status === 'ACTIVE') return { ok: true, alreadyActive: true };
    if (tenant.status !== 'SUSPENDED') {
      throw new ConflictException(
        `Loyiha holati "${tenant.status}" — faqat to'xtatilganini qaytarish mumkin`,
      );
    }

    // Obuna hali ham tugagan bo'lsa qaytarish mantiqsiz: keyingi tekshiruv
    // uni yana to'xtatadi va loyiha o'chib-yonib turadi.
    const sub = tenant.subscription;
    if (sub?.currentPeriodEnd && sub.currentPeriodEnd <= new Date()) {
      throw new ConflictException(
        "Obuna muddati hali ham o'tgan — avval sinov bering yoki tarifni uzaytiring",
      );
    }

    const done = await this.provisioning.resume(tenantId);
    if (!done) {
      throw new ConflictException(
        "Qayta yoqib bo'lmadi — VPS skripti xato qaytardi, logni tekshiring",
      );
    }
    return { ok: true, status: 'ACTIVE' };
  }

  /**
   * Muddat uzaytirilganda chaqiriladi (sinov berildi, to'lov keldi): tenant
   * AVTOMATIK to'xtatilgan bo'lsa qaytaradi.
   *
   * Admin QO'LDA to'xtatgan bo'lsa TEGILMAYDI — uni qaytarish ham qo'lda
   * bo'lishi kerak, aks holda "to'xtatdim" degan qaror to'lov kelishi bilan
   * jimgina bekor bo'lardi.
   */
  async resumeIfAutoSuspended(tenantId: string): Promise<boolean> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, suspendReason: true },
    });
    if (!t || t.status !== 'SUSPENDED') return false;
    if (!t.suspendReason?.startsWith(AUTO_SUSPEND_REASON)) return false;

    return this.provisioning.resume(tenantId);
  }

  // ======================= MUDDAT TEKSHIRUVI =======================

  /**
   * Muddati o'tgan obunalarni topadi, EXPIRED qilib belgilaydi va tenant
   * serverini to'xtatadi.
   *
   * Idempotent: ikki marta ishlasa ikkinchisida qiladigan ishi qolmaydi.
   * Shuning uchun uni xohlagancha tez-tez chaqirish xavfsiz.
   */
  async sweepExpired(): Promise<{
    checked: number;
    expired: number;
    suspended: number;
    failed: number;
    skipped: number;
  }> {
    // Grace period muddatga QO'SHILADI: 24 soat berilgan bo'lsa, kecha
    // tugagan obuna bugun ham ishlashda davom etadi.
    const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);

    // EXPIRED va CANCELED ham QAMRAB OLINADI. Sabab: obunani EXPIRED qilib
    // belgilash oson, lekin pm2 ni to'xtatish VPS skriptiga bog'liq va u
    // yiqilishi mumkin. Agar faqat "hali EXPIRED bo'lmagan"larni olsak,
    // birinchi urinish yiqilgan tenant abadiy ishlab qolaverardi.
    // Endi har tekshiruvda "obunasi tugagan, lekin hali ishlab turgan"
    // loyihalar qaytadan topiladi.
    const due = await this.prisma.subscription.findMany({
      where: {
        currentPeriodEnd: { not: null, lte: cutoff },
        status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELED'] },
      },
      include: {
        tenant: { select: { id: true, domain: true, status: true } },
      },
    });

    let expired = 0;
    let suspended = 0;
    let failed = 0;
    let skipped = 0;

    for (const sub of due) {
      // CANCELED o'zgartirilmaydi — "mijoz voz kechdi" ma'lumoti "muddat
      // tugadi" dan ko'ra qimmatliroq va u ham serverni to'xtatadi.
      if (sub.status !== 'EXPIRED' && sub.status !== 'CANCELED') {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'EXPIRED' },
        });
        expired += 1;
      }

      if (!AUTO_SUSPEND) {
        skipped += 1;
        continue;
      }

      // Faqat ishlab turgan loyiha to'xtatiladi. PROVISIONING/FAILED/DELETED
      // holatidagisiga tegish yarim bajarilgan ishni buzardi.
      if (sub.tenant.status !== 'ACTIVE') {
        skipped += 1;
        continue;
      }

      const reason = `${AUTO_SUSPEND_REASON} (${formatDay(sub.currentPeriodEnd!)})`;
      const ok = await this.provisioning.suspend(sub.tenant.id, reason);
      if (ok) suspended += 1;
      else failed += 1;
    }

    // Faqat ish bo'lgan tekshiruv logga tushadi: har 15 daqiqada "0 ta"
    // deb yozish logni foydasiz to'ldirardi.
    if (expired > 0 || suspended > 0 || failed > 0) {
      this.logger.warn(
        `Muddat tekshiruvi: ${due.length} obuna muddati o'tgan, ` +
          `${expired} tasi endi EXPIRED, ${suspended} loyiha to'xtatildi` +
          (failed ? `, ${failed} tasi to'xtamadi` : ''),
      );
    }

    return { checked: due.length, expired, suspended, failed, skipped };
  }

  /**
   * Sinov/obunasi tugash arafasidagi loyihalar — panel ogohlantirishi uchun.
   * Standart oyna 7 kun.
   */
  async expiringSoon(days = 7) {
    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.subscription.findMany({
      where: {
        status: { in: ['TRIALING', 'ACTIVE'] },
        currentPeriodEnd: { not: null, lte: until, gt: new Date() },
      },
      orderBy: { currentPeriodEnd: 'asc' },
      include: {
        plan: { select: { key: true, name: true } },
        tenant: {
          select: { id: true, name: true, domain: true, status: true },
        },
      },
    });
  }

  /** Sozlamalar holati — panelda "avtomatik to'xtatish yoqilganmi" ko'rinadi. */
  config() {
    return {
      autoSuspend: AUTO_SUSPEND,
      graceHours: GRACE_HOURS,
    };
  }
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
