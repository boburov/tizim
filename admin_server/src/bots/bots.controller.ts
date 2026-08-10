import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BotsService } from './bots.service.js';
import {
  CreateBotDto,
  LogsQueryDto,
  ReplaceEnvDto,
  UpdateBotDto,
} from './dto/bot.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';

/**
 * Telegram botlarni boshqarish.
 *
 * Marshrut tartibi muhim: `templates` statik segmenti `:id` dan OLDIN
 * turishi kerak, aks holda Nest uni bot id'si deb qabul qiladi.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bots')
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Get('templates')
  templates() {
    return this.bots.listTemplates();
  }

  @Get()
  list() {
    return this.bots.list();
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateBotDto, @CurrentUser() user: AuthUser) {
    return this.bots.create(dto, user?.email);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bots.findOne(id);
  }

  /** Telegram tarafidagi haqiqiy holat (webhook mos keladimi). */
  @Get(':id/telegram')
  telegram(@Param('id') id: string) {
    return this.bots.telegramStatus(id);
  }

  @Get(':id/logs')
  logs(@Param('id') id: string, @Query() q: LogsQueryDto) {
    return this.bots.logs(id, q.lines ?? 200);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.bots.update(id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id/env')
  replaceEnv(@Param('id') id: string, @Body() dto: ReplaceEnvDto) {
    return this.bots.replaceEnv(id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/deploy')
  @HttpCode(200)
  deploy(@Param('id') id: string) {
    return this.bots.deploy(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/stop')
  @HttpCode(200)
  stop(@Param('id') id: string) {
    return this.bots.control(id, 'stop');
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/start')
  @HttpCode(200)
  start(@Param('id') id: string) {
    return this.bots.control(id, 'start');
  }

  /** VPS'dan o'chirish (yozuv arxiv sifatida qoladi). */
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.bots.remove(id);
  }

  /** Arxiv yozuvini bazadan tozalash. */
  @Roles('SUPER_ADMIN')
  @Delete(':id/purge')
  @HttpCode(200)
  purge(@Param('id') id: string) {
    return this.bots.purge(id);
  }
}
