import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CustomerAuthService } from './customer-auth.service.js';
import { CustomersService } from './customers.service.js';
import {
  CustomerAuthController,
  CustomerPortalController,
} from './customers.controller.js';
import { CustomerJwtGuard } from '../common/guards/customer-jwt.guard.js';
import { GoogleStrategy, googleEnabled } from './google.strategy.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { PlansModule } from '../plans/plans.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';

@Module({
  imports: [
    JwtModule.register({}),
    TenantsModule,
    PlansModule,
    EntitlementsModule,
  ],
  controllers: [CustomerAuthController, CustomerPortalController],
  providers: [
    CustomerAuthService,
    CustomersService,
    CustomerJwtGuard,
    // Google strategiyasi FAQAT kalitlar sozlangan bo'lsa ro'yxatdan o'tadi.
    // Aks holda passport konstruktorda "OAuth2Strategy requires a clientID"
    // deb ilovani ishga tushirmasdi.
    ...(googleEnabled() ? [GoogleStrategy] : []),
  ],
  exports: [CustomerAuthService],
})
export class CustomersModule {}
