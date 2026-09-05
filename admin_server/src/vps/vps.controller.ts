import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { VpsService } from './vps.service.js';
import { CreateVpsDto, UpdateVpsDto } from './dto/vps.dto.js';

/**
 * VPS — /vps
 *
 * O'qish: hamma admin roli. Yozish va ulanish testi: SUPER_ADMIN.
 * Sabab: bu yozuvlar PRODUCTION serverlarga SSH kirishini saqlaydi;
 * ularni o'zgartirish = infratuzilmaga kirish.
 *
 * Javoblarda sir YO'Q — servis `sanitize()` qiladi.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vps')
export class VpsController {
  constructor(private readonly vps: VpsService) {}

  @Get()
  list() {
    return this.vps.findAll();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.vps.findOne(id);
  }

  @Roles('SUPER_ADMIN')
  @Post()
  create(@Body() dto: CreateVpsDto, @CurrentUser() user: AuthUser) {
    return this.vps.create(dto, user?.email);
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVpsDto) {
    return this.vps.update(id, dto);
  }

  @Roles('SUPER_ADMIN')
  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.vps.remove(id);
  }

  /** Ulanish + resurs + vositalar testi. Natija yozuvga saqlanadi. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/test')
  @HttpCode(200)
  test(@Param('id') id: string) {
    return this.vps.test(id);
  }
}
