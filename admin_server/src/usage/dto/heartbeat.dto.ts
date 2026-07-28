import { IsObject, IsOptional, IsString } from 'class-validator';

export class HeartbeatDto {
  /**
   * Metrikalar: { "user_count": 42, "student_count": 310, "storage_mb": 128 }
   * Kalitlar dinamik — yangi metrika qo'shilsa kod o'zgarmaydi.
   * Qiymatlar servisda raqamga aylantiriladi va tekshiriladi.
   */
  @IsObject()
  metrics!: Record<string, unknown>;

  /** Tenant server versiyasi (ixtiyoriy, diagnostika uchun). */
  @IsOptional()
  @IsString()
  appVersion?: string;
}
