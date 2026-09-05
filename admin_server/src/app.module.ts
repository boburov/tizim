import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { TenantDbModule } from './tenant-db/tenant-db.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { BranchConfigModule } from './branch-config/branch-config.module.js';
import { UsersModule } from './users/users.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { EntitlementsModule } from './entitlements/entitlements.module.js';
import { TenantFeaturesModule } from './tenant-features/tenant-features.module.js';
import { UsageModule } from './usage/usage.module.js';
import { PlansModule } from './plans/plans.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { BillingModule } from './billing/billing.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { GithubModule } from './github/github.module.js';
import { ApiServicesModule } from './api-services/api-services.module.js';
import { BotsModule } from './bots/bots.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { VpsModule } from './vps/vps.module.js';
import { TenantAnalyticsModule } from './tenant-analytics/tenant-analytics.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    // Tenant bazasiga to'g'ridan-to'g'ri ulanish (ega hisobi). Global.
    TenantDbModule,
    AuthModule,
    TemplatesModule,
    TenantsModule,
    // ⚠ TenantsModule'dan KEYIN: `tenants/:id/branch-*` yo'llari
    // `tenants/:id` dan uzunroq, ya'ni ular bilan to'qnashmaydi.
    BranchConfigModule,
    UsersModule,
    MaintenanceModule,
    EntitlementsModule,
    // Loyiha modullarini yoqish/o'chirish (tarifdan ustun qaror).
    TenantFeaturesModule,
    UsageModule,
    PlansModule,
    CustomersModule,
    BillingModule,
    SettingsModule,
    GithubModule,
    ApiServicesModule,
    BotsModule,
    SubscriptionsModule,
    // Logo yuklash (`tenants/:id/logo`).
    UploadsModule,
    // VPS — tenantlar joylashadigan serverlar (SSH ulanish, resurslar).
    VpsModule,
    // Tenantdan tortib olinadigan biznes/moliya analitikasi.
    TenantAnalyticsModule,
  ],
})
export class AppModule {}
