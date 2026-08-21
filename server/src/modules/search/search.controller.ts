import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { searchSchema, type SearchRequest } from './search.validators.js';

/**
 * GLOBAL QIDIRUV (⌘K) — Express `search.routes.js` EKVIVALENTI (1/1).
 *
 * ⚠ RUXSATLAR SERVISGA UZATILADI, servis kontekstdan O'QIMAYDI:
 * to'lov bo'limi `finance.read` siz umuman so'ralmaydi. Servis
 * testlardan ham chaqiriladi va u yerda kontekst boshqacha bo'ladi.
 */
@Controller('search')
@UseGuards(PermissionsGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Permissions(PERMISSIONS.USERS_READ)
  async globalSearch(
    @Validated(searchSchema) v: SearchRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.search.globalSearch(v.query.q, {
      limit: v.query.limit ? Number(v.query.limit) : 5,
      permissions: req.permissions || [],
    });
    return { success: true, data };
  }
}
