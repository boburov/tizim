import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { UsersModule } from './users/users.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { EntitlementsModule } from './entitlements/entitlements.module.js';
import { UsageModule } from './usage/usage.module.js';
import { PlansModule } from './plans/plans.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { BillingModule } from './billing/billing.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { GithubModule } from './github/github.module.js';
import { ApiServicesModule } from './api-services/api-services.module.js';
import { BotsModule } from './bots/bots.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TemplatesModule,
    TenantsModule,
    UsersModule,
    MaintenanceModule,
    EntitlementsModule,
    UsageModule,
    PlansModule,
    CustomersModule,
    BillingModule,
    SettingsModule,
    GithubModule,
    ApiServicesModule,
    BotsModule,
    SubscriptionsModule,
  ],
})
export class AppModule {}
