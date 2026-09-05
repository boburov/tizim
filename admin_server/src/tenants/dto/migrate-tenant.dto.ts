import { IsString, MinLength } from 'class-validator';

/** Tenantni boshqa VPS'ga ko'chirish. */
export class MigrateTenantDto {
  @IsString()
  @MinLength(1)
  targetVpsId!: string;
}

/**
 * Ko'chirishdan keyin eski nusxani tozalash.
 *
 * `confirmDomain` MAJBURIY: bu amal boshqa serverdagi papkani, bazani va
 * nginx vhost'ini o'chiradi. Noto'g'ri tenantda bajarilsa tirik loyiha
 * yo'q bo'lardi — shuning uchun `remove()` dagi bilan AYNI himoya.
 */
export class DecommissionSourceDto {
  @IsString()
  @MinLength(1)
  sourceVpsId!: string;

  @IsString()
  @MinLength(1)
  confirmDomain!: string;
}
