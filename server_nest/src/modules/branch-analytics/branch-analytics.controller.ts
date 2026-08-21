import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RoomUtilizationService } from './room-utilization.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  roomUtilizationSchema, type RoomUtilizationRequest,
} from './branch-analytics.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL TAHLILI — FAQAT XONA BANDLIGI (`GET /branch-analytics/rooms`).
 *
 * ⚠ QOLGAN MARSHRUTLAR ATAYLAB KO'CHIRILMAGAN va bu yerda E'LON
 * QILINMAGAN: `/pnl`, `/elimination`, `/utilization`, `/churn`,
 * `/normalized`, `/teachers`, `/sales`, `/alerts`, `/transfer*`.
 * Ular MOLIYA tahlili ko'lamiga kiradi (P&L, ichki aylanma, sotuv) va
 * boshqa faza ishi. NestJS ularga 404 qaytaradi — SCAFFOLD QILINMAGAN.
 *
 * ⚠ RUXSAT `classes.read` — ATAYLAB `branches.read` EMAS. Javobda pul
 * ham, maosh ham yo'q: faqat xona va dars jadvali. Filial
 * administratori o'z xonalari bandligini ko'rishi uchun unga filial
 * ro'yxatini ochish SHART EMAS.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('branch-analytics')
@UseGuards(PermissionsGuard)
export class BranchAnalyticsRoomsController {
  constructor(private readonly roomUtilization: RoomUtilizationService) {}

  @Get('rooms')
  @Permissions(PERMISSIONS.CLASSES_READ)
  async rooms(
    @Validated(roomUtilizationSchema) v: RoomUtilizationRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ `undefined` va `Number(...)` FARQI SAQLANADI: Express handler'i
    // aynan shunday yozadi — berilmagan parametr standart qiymatga
    // tushadi, berilgani esa songa aylantiriladi.
    const q = req.query as Record<string, unknown>;
    const data = await this.roomUtilization.getRoomUtilization({
      branchId: v.query.branchId,
      dayStart: q.dayStart === undefined ? undefined : Number(q.dayStart),
      dayEnd: q.dayEnd === undefined ? undefined : Number(q.dayEnd),
    });
    return { success: true, data };
  }
}
