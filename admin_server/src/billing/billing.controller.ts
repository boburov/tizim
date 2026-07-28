import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { BillingService } from './billing.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CustomerJwtGuard,
  CustomerRequest,
  currentCustomer,
} from '../common/guards/customer-jwt.guard.js';

export class CreateInvoiceDto {
  @IsString() tenantId!: string;
  @IsString() planKey!: string;
  @IsIn(['PAYME', 'CLICK', 'MANUAL']) provider!: 'PAYME' | 'CLICK' | 'MANUAL';
}

/** Mijoz uchun to'lov marshrutlari. */
@UseGuards(CustomerJwtGuard)
@Controller('customer/billing')
export class CustomerBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('transactions')
  myTransactions(@Req() req: CustomerRequest) {
    return this.billing.listForCustomer(currentCustomer(req).sub);
  }

  @Post('invoice')
  createInvoice(@Req() req: CustomerRequest, @Body() dto: CreateInvoiceDto) {
    return this.billing.createInvoice(
      currentCustomer(req).sub,
      dto.tenantId,
      dto.planKey,
      dto.provider,
    );
  }
}

/** Admin uchun to'lovlar ro'yxati va qo'lda tasdiqlash. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('transactions')
  all() {
    return this.billing.listAll();
  }

  /** Naqd/bank o'tkazma bo'lsa admin qo'lda tasdiqlaydi. */
  @Roles('SUPER_ADMIN')
  @Post('transactions/:id/mark-paid')
  @HttpCode(200)
  markPaid(@Param('id') id: string) {
    return this.billing.markPaid(id, undefined, 'admin tomonidan qo\'lda');
  }

  @Roles('SUPER_ADMIN')
  @Post('transactions/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.billing.cancelTransaction(id, 'admin bekor qildi');
  }
}

/**
 * Provayder webhook'lari (ochiq endpoint — JWT yo'q, imzo bilan himoyalanadi).
 *
 * DIQQAT: imzo tekshiruvi hali yozilmagan, shuning uchun bu endpoint
 * hozircha HAR DOIM 403 qaytaradi. Bu ataylab — ochiq qoldirilsa
 * istalgan odam bepul obuna ola olardi.
 */
@Controller('billing/webhook')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('payme')
  @HttpCode(200)
  payme(@Headers() headers: any, @Body() body: any) {
    if (!this.billing.verifySignature('PAYME', headers, body)) {
      throw new ForbiddenException(
        "Payme imzo tekshiruvi sozlanmagan — merchant kalitini .env ga qo'shing",
      );
    }
    // TODO: Payme JSON-RPC metodlari (CheckPerformTransaction, PerformTransaction...)
    return { ok: true };
  }

  @Post('click')
  @HttpCode(200)
  click(@Headers() headers: any, @Body() body: any) {
    if (!this.billing.verifySignature('CLICK', headers, body)) {
      throw new ForbiddenException(
        "Click imzo tekshiruvi sozlanmagan — SECRET_KEY ni .env ga qo'shing",
      );
    }
    // TODO: Click Prepare/Complete oqimi
    return { ok: true };
  }
}
