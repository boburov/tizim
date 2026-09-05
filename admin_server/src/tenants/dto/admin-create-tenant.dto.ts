import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CreateTenantDto } from './create-tenant.dto.js';
import { OWNER_PASSWORD_MIN, OWNER_USERNAME_RULE } from './tenant-owner.dto.js';

/**
 * DEVELOPER ADMIN OQIMI UCHUN TENANT YARATISH.
 *
 * ── ⚠ NEGA ALOHIDA DTO ──
 *
 * `CreateTenantDto` mijozning self-service yo'li bilan BAHAM KO'RILADI.
 * Ega login/parolini o'sha bazaviy DTO'da majburiy qilish o'sha yo'lni
 * darhol 400 bilan yiqitardi.
 *
 * ── NEGA MAJBURIY ──
 *
 * Ilgari provisioning hech qanday foydalanuvchi yaratmasdi: mijoz
 * ishlaydigan domen olardi-yu, unga KIRA OLMASDI. Maydonni ixtiyoriy
 * qilish o'sha holatni qaytaradi — shuning uchun DTO darajasida majburiy.
 */
export class AdminCreateTenantDto extends CreateTenantDto {
  @IsString()
  @Matches(OWNER_USERNAME_RULE, {
    message:
      "Login 3-32 belgi: kichik harf, raqam, nuqta, tire yoki pastki chiziq",
  })
  ownerUsername!: string;

  @IsString()
  @MinLength(OWNER_PASSWORD_MIN, {
    message: `Parol kamida ${OWNER_PASSWORD_MIN} belgi`,
  })
  @MaxLength(128)
  ownerPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ownerFirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ownerLastName?: string;
}
