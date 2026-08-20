import { Module } from '@nestjs/common';
import { PayrollAuditService } from './payroll-audit.service.js';

/**
 * ⚠ KONTROLLERSIZ — ATAYLAB. `/api/staff-payroll` ning 30 marshruti
 * FAZA 8 da ko'chadi. Hozir faqat audit YOZUVI kerak: `PATCH /users/:id`
 * da `hiredAt` o'zgarsa uning izi qolishi shart.
 */
@Module({
  providers: [PayrollAuditService],
  exports: [PayrollAuditService],
})
export class StaffPayrollModule {}
