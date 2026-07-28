import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './jwt.strategy.js';
import { CustomersModule } from '../customers/customers.module.js';

@Module({
  // Yagona login uchun mijoz auth xizmati ham kerak.
  imports: [PassportModule, JwtModule.register({}), CustomersModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
