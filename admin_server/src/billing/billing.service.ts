import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlansService } from '../plans/plans.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';

/**
 * To'lov tizimi (Payme / Click) uchun asos.
 *
 * HOZIRGI HOLAT: bu skelet. Invoice yaratish, tranzaksiyani belgilash va
 * obunani uzaytirish mantiqi to'liq ishlaydi. Payme/Click'ning IMZO
 * (signature) tekshiruvi ULANMAGAN — provayder shartnomasi va merchant
 * kalitlari olingach `verifySignature()` ichi to'ldirilishi kerak.
 *
 * Shu sababli webhook endpoint'i ishlab chiqarishda ochilishidan oldin
 * albatta imzo tekshiruvi yozilishi shart, aks holda istalgan odam
 * "to'landi" deb so'rov yuborib bepul obuna ola oladi.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Tarif uchun to'lov yaratadi (PENDING holatda). */
  async createInvoice(
    customerId: string,
    tenantId: string,
    planKey: string,
    provider: 'PAYME' | 'CLICK' | 'MANUAL',
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, customerId: true, status: true },
    });
    if (!tenant || tenant.customerId !== customerId) {
      throw new NotFoundException('Loyiha topilmadi');
    }

    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Tarif mavjud emas');
    }

    // Obuna bo'lmasa yaratamiz (PAST_DUE holatda — to'langach ACTIVE bo'ladi)
    let sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) {
      sub = await this.prisma.subscription.create({
        data: {
          tenantId,
          planId: plan.id,
          customerId,
          status: 'PAST_DUE',
        },
      });
    }

    return this.prisma.transaction.create({
      data: {
        subscriptionId: sub.id,
        customerId,
        amount: plan.price,
        currency: plan.currency,
        provider,
        status: 'PENDING',
      },
    });
  }

  /**
   * To'lovni tasdiqlaydi va obunani uzaytiradi.
   *
   * Idempotent: bir tranzaksiya ikki marta kelsa (provayder qayta yuborsa)
   * obuna ikki marta uzaytirilmaydi.
   */
  async markPaid(
    transactionId: string,
    providerTxnId?: string,
    rawPayload?: string,
  ) {
    const txn = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!txn) throw new NotFoundException('Tranzaksiya topilmadi');

    // Allaqachon to'langan — qayta ishlamaymiz
    if (txn.status === 'PAID') {
      return { ok: true, alreadyPaid: true, transaction: txn };
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        providerTxnId,
        rawPayload,
      },
    });

    // Obunani uzaytiramiz
    if (txn.subscription) {
      const plan = txn.subscription.plan;
      const tenantId = txn.subscription.tenantId;
      const base =
        txn.subscription.currentPeriodEnd &&
        txn.subscription.currentPeriodEnd > new Date()
          ? txn.subscription.currentPeriodEnd // muddat tugamagan — ustiga qo'shamiz
          : new Date();

      const end = new Date(base);
      if (plan.interval === 'YEARLY') end.setFullYear(end.getFullYear() + 1);
      else if (plan.interval === 'MONTHLY') end.setMonth(end.getMonth() + 1);

      await this.prisma.subscription.update({
        where: { id: txn.subscription.id },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: plan.interval === 'LIFETIME' ? null : end,
        },
      });

      // Muddat tugagani uchun to'xtatilgan bo'lsa — to'lov uni qaytaradi.
      // Xato bo'lsa to'lov BEKOR QILINMAYDI: pul o'tgan, obuna uzaygan;
      // serverni qaytarish alohida amal va uni paneldan qayta urinish
      // mumkin. Shuning uchun bu yerda faqat logga yozamiz.
      await this.subscriptions
        .resumeIfAutoSuspended(tenantId)
        .catch((err) =>
          this.logger.error(
            `To'lovdan keyin server qaytarilmadi (${tenantId}): ${err.message}`,
          ),
        );
    }

    this.logger.log(`To'lov tasdiqlandi: ${transactionId} (${txn.provider})`);
    return { ok: true, transaction: updated };
  }

  async cancelTransaction(transactionId: string, reason?: string) {
    const txn = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!txn) throw new NotFoundException('Tranzaksiya topilmadi');

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'CANCELED', rawPayload: reason },
    });
  }

  listForCustomer(customerId: string) {
    return this.prisma.transaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { subscription: { include: { plan: { select: { name: true } } } } },
    });
  }

  listAll() {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        customer: { select: { email: true, fullName: true } },
        subscription: { include: { plan: { select: { name: true } } } },
      },
    });
  }

  /**
   * Provayder imzosini tekshiradi.
   *
   * HOZIRCHA ULANMAGAN — merchant kalitlari olingach to'ldiriladi:
   *  - Payme:  Authorization: Basic base64("Paycom:" + MERCHANT_KEY)
   *  - Click:  md5(click_trans_id + service_id + SECRET_KEY + ...)
   *
   * `false` qaytadi, ya'ni webhook YOPIQ — bu ataylab: kalitsiz ochiq
   * qoldirilsa har kim "to'landi" deb yuborishi mumkin bo'lardi.
   */
  verifySignature(provider: 'PAYME' | 'CLICK', _headers: any, _body: any): boolean {
    const key =
      provider === 'PAYME'
        ? process.env.PAYME_MERCHANT_KEY
        : process.env.CLICK_SECRET_KEY;

    if (!key) {
      this.logger.warn(
        `${provider} kaliti .env da yo'q — webhook rad etildi`,
      );
      return false;
    }

    // TODO: haqiqiy imzo tekshiruvi (provayder hujjatiga qarab)
    this.logger.warn(
      `${provider} imzo tekshiruvi hali yozilmagan — webhook rad etildi`,
    );
    return false;
  }
}
