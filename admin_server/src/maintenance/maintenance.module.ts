import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';
import { MaintenanceController } from './maintenance.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule], // parolni qayta tekshirish uchun AuthService kerak
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
