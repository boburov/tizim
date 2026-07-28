import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';
import { ResetDatabaseDto } from './dto/reset-database.dto.js';
import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator.js';

// Bazani tozalash — eng xavfli amal, faqat SUPER_ADMIN
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly auth: AuthService,
  ) {}

  /** Tozalashdan oldin nechta yozuv o'chishini ko'rsatadi. */
  @Get('stats')
  stats() {
    return this.maintenance.stats();
  }

  @Post('reset-database')
  @HttpCode(200)
  async resetDatabase(
    @Body() dto: ResetDatabaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Token o'g'irlangan bo'lsa ham parolsiz bazani tozalab bo'lmasin.
    let verified: AuthUser;
    try {
      verified = await this.auth.validateUser(user.email, dto.password);
    } catch {
      throw new UnauthorizedException("Parol noto'g'ri");
    }

    // Parol tekshiruvi rolni ham qayta tasdiqlaydi (token eskirgan bo'lishi mumkin).
    if (verified.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Faqat super admin bazani tozalay oladi');
    }

    return this.maintenance.resetDatabase(verified.email);
  }
}
