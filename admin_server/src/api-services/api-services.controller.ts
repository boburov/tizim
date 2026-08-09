import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiServicesService } from './api-services.service.js';
import {
  ChangeStatusDto,
  ChangeTierDto,
  CreateApiConsumerDto,
  CreateApiKeyDto,
  CreateApiServiceDto,
  CreateApiSubscriptionDto,
  CreateApiTierDto,
  ExtendSubscriptionDto,
  UpdateApiConsumerDto,
  UpdateApiServiceDto,
  UpdateApiTierDto,
} from './dto/api-service.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';

/**
 * Admin paneli uchun API xizmatlarini boshqarish.
 *
 * Marshrut tartibi MUHIM: `consumers`, `tiers`, `subscriptions`, `keys` kabi
 * statik segmentlar `:id` dan OLDIN turishi kerak, aks holda Nest ularni
 * xizmat id'si deb qabul qiladi.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api-services')
export class ApiServicesController {
  constructor(private readonly svc: ApiServicesService) {}

  // --- Mijozlar (statik marshrutlar birinchi) ---

  @Get('consumers')
  listConsumers() {
    return this.svc.listConsumers();
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('consumers')
  createConsumer(@Body() dto: CreateApiConsumerDto) {
    return this.svc.createConsumer(dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('consumers/:id')
  updateConsumer(@Param('id') id: string, @Body() dto: UpdateApiConsumerDto) {
    return this.svc.updateConsumer(id, dto);
  }

  // --- Tariflar ---

  @Roles('SUPER_ADMIN')
  @Patch('tiers/:tierId')
  updateTier(@Param('tierId') tierId: string, @Body() dto: UpdateApiTierDto) {
    return this.svc.updateTier(tierId, dto);
  }

  @Roles('SUPER_ADMIN')
  @Delete('tiers/:tierId')
  @HttpCode(200)
  removeTier(@Param('tierId') tierId: string) {
    return this.svc.removeTier(tierId);
  }

  // --- Obunalar ---

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('subscriptions/:sid/tier')
  changeTier(@Param('sid') sid: string, @Body() dto: ChangeTierDto) {
    return this.svc.changeTier(sid, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('subscriptions/:sid/extend')
  extend(@Param('sid') sid: string, @Body() dto: ExtendSubscriptionDto) {
    return this.svc.extend(sid, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('subscriptions/:sid/status')
  changeStatus(@Param('sid') sid: string, @Body() dto: ChangeStatusDto) {
    return this.svc.changeStatus(sid, dto);
  }

  @Get('subscriptions/:sid/usage')
  usage(@Param('sid') sid: string, @Query('days') days?: string) {
    const d = Number(days);
    return this.svc.usageHistory(
      sid,
      Number.isFinite(d) && d > 0 && d <= 365 ? d : 30,
    );
  }

  // --- Kalitlar ---

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('subscriptions/:sid/keys')
  createKey(
    @Param('sid') sid: string,
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createKey(sid, dto, user?.email);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete('keys/:keyId')
  @HttpCode(200)
  revokeKey(@Param('keyId') keyId: string) {
    return this.svc.revokeKey(keyId);
  }

  // --- Xizmatlar (dinamik `:id` marshrutlari oxirida) ---

  @Get()
  list() {
    return this.svc.listServices();
  }

  @Roles('SUPER_ADMIN')
  @Post()
  create(@Body() dto: CreateApiServiceDto) {
    return this.svc.createService(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.getService(id);
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateApiServiceDto) {
    return this.svc.updateService(id, dto);
  }

  @Roles('SUPER_ADMIN')
  @Post(':id/tiers')
  createTier(@Param('id') id: string, @Body() dto: CreateApiTierDto) {
    return this.svc.createTier(id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/subscriptions')
  createSubscription(
    @Param('id') id: string,
    @Body() dto: CreateApiSubscriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createSubscription(id, dto, user?.email);
  }
}
