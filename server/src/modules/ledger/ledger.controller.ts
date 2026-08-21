import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { LedgerService } from './ledger.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { statementSchema, type StatementRequest } from './ledger.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `GET /ledger/me` — O'Z moliyaviy tarixi. ALOHIDA KONTROLLER.
 *
 * ⚠ RUXSAT TEKSHIRILMAYDI — odam o'z balansini ko'radi. Kirish sifatida
 * FAQAT `req.user._id` ishlatiladi, boshqa hech qanday parametr qabul
 * qilinmaydi, ya'ni bu yerda "kimning" degan savol umuman yo'q.
 *
 * ⚠ E'LON TARTIBI: `/me` `/:userId` DAN OLDIN ro'yxatdan o'tishi SHART —
 * aks holda "me" `:userId` sifatida tutilib, 24 belgilik ID
 * validatsiyasida yiqilardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('ledger')
export class LedgerMeController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('me')
  async myStatement(@Req() req: AuthenticatedRequest) {
    const q = req.query as Record<string, unknown>;
    const data = await this.ledger.statementFor(String(req.user!._id), {
      from: q.from || null,
      to: q.to || null,
      // ⚠ Ko'lam chetlab o'tiladi — batafsil sabab servisda.
      ownProfile: true,
    });
    return { success: true, data };
  }
}

/**
 * `GET /ledger/:userId` — BOSHQA odamning moliyaviy tarixi.
 *
 * ⚠ IKKI RUXSATDAN BIRI YETARLI (OR): o'quvchi moliyasini ko'radigan
 * xodim (`finance.read`) va maosh ko'radigan xodim (`salary.read`)
 * odatda TURLI odamlar. Bitta manzil ikkala rolga ham xizmat qiladi.
 *
 * Ko'rilayotgan odam ko'lamdan tashqarida bo'lsa servis 404 qaytaradi
 * (`userBranchCondition`) — 403 EMAS: mavjudligini ham oshkor qilmaymiz.
 */
@Controller('ledger')
@UseGuards(PermissionsGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get(':userId')
  @Permissions(PERMISSIONS.FINANCE_READ, PERMISSIONS.SALARY_READ)
  async statement(@Validated(statementSchema) v: StatementRequest) {
    const data = await this.ledger.statementFor(v.params.userId, {
      from: v.query.from || null,
      to: v.query.to || null,
    });
    return { success: true, data };
  }
}
