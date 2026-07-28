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
import { PlansService } from './plans.service.js';
import {
  AssignPlanDto,
  CreateFeatureDto,
  CreatePlanDto,
  UpdateFeatureDto,
  UpdatePlanDto,
} from './dto/plan.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  // --- Imkoniyatlar (features) ---
  @Get('features')
  listFeatures() {
    return this.plans.listFeatures();
  }

  @Roles('SUPER_ADMIN')
  @Post('features')
  createFeature(@Body() dto: CreateFeatureDto) {
    return this.plans.createFeature(dto);
  }

  @Roles('SUPER_ADMIN')
  @Patch('features/:id')
  updateFeature(@Param('id') id: string, @Body() dto: UpdateFeatureDto) {
    return this.plans.updateFeature(id, dto);
  }

  @Roles('SUPER_ADMIN')
  @Delete('features/:id')
  @HttpCode(200)
  removeFeature(@Param('id') id: string) {
    return this.plans.removeFeature(id);
  }

  // --- Tariflar ---
  @Get()
  listPlans() {
    return this.plans.listPlans();
  }

  @Get(':id')
  findPlan(@Param('id') id: string) {
    return this.plans.findPlan(id);
  }

  @Roles('SUPER_ADMIN')
  @Post()
  createPlan(@Body() dto: CreatePlanDto) {
    return this.plans.createPlan(dto);
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.updatePlan(id, dto);
  }

  @Roles('SUPER_ADMIN')
  @Delete(':id')
  @HttpCode(200)
  removePlan(@Param('id') id: string) {
    return this.plans.removePlan(id);
  }
}

/** Tenantga tarif biriktirish. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants/:tenantId/subscription')
export class TenantSubscriptionController {
  constructor(private readonly plans: PlansService) {}

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  @HttpCode(200)
  assign(@Param('tenantId') tenantId: string, @Body() dto: AssignPlanDto) {
    return this.plans.assignPlan(tenantId, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete()
  @HttpCode(200)
  cancel(@Param('tenantId') tenantId: string) {
    return this.plans.cancelSubscription(tenantId);
  }
}
