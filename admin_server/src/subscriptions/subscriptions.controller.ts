import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { SubscriptionSchedulerService } from './subscription-scheduler.service.js';
import { GrantTrialDto, SuspendTenantDto } from './dto/subscription.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';

/**
 * Obuna hayot sikli: bepul sinov, to'xtatish/qaytarish, muddat kuzatuvi.
 *
 * MIJOZ OQIMIDA BU YO'LLAR YO'Q. `CustomerJwtGuard` bilan himoyalangan
 * `customer/*` marshrutlaridan sinov berish imkoni ataylab qo'shilmagan —
 * sinovni faqat admin beradi.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly scheduler: SubscriptionSchedulerService,
  ) {}

  /** Bepul sinov berish (1-30 kun). */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('tenants/:tenantId/trial')
  @HttpCode(200)
  grantTrial(
    @Param('tenantId') tenantId: string,
    @Body() dto: GrantTrialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subscriptions.grantTrial(tenantId, dto, user?.email);
  }

  /** Qo'lda to'xtatish — pm2 jarayoni o'chadi, ma'lumot tegilmaydi. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('tenants/:tenantId/suspend')
  @HttpCode(200)
  suspend(
    @Param('tenantId') tenantId: string,
    @Body() dto: SuspendTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    const reason = dto?.reason
      ? `${dto.reason} (${user?.email || 'admin'})`
      : `Admin qo'lda to'xtatdi (${user?.email || 'admin'})`;
    return this.subscriptions.suspend(tenantId, reason);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('tenants/:tenantId/resume')
  @HttpCode(200)
  resume(@Param('tenantId') tenantId: string) {
    return this.subscriptions.resume(tenantId);
  }

  /** Yaqin kunlarda tugaydigan obunalar — ogohlantirish uchun. */
  @Get('expiring')
  expiring(@Query('days') days?: string) {
    const d = Number(days);
    return this.subscriptions.expiringSoon(
      Number.isFinite(d) && d > 0 && d <= 90 ? d : 7,
    );
  }

  /** Kuzatuvchining holati: oxirgi tekshiruv, oraliq, sozlamalar. */
  @Get('checker')
  checkerStatus() {
    return this.scheduler.status();
  }

  /** "Hozir tekshir" — jadval kutmasdan darrov ishga tushiradi. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('checker/run')
  @HttpCode(200)
  runCheck() {
    return this.scheduler.runNow();
  }
}
