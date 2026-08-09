import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const KEY_RE = /^[a-z][a-z0-9-]{1,48}$/;

// --- Xizmat ---

export class CreateApiServiceDto {
  @Matches(KEY_RE, {
    message: "key faqat kichik harf, raqam va - dan iborat bo'lsin",
  })
  key!: string;

  @IsString() @MinLength(2) name!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() docsUrl?: string;
}

export class UpdateApiServiceDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() docsUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// --- Tarif ---

export class CreateApiTierDto {
  @Matches(KEY_RE, {
    message: "key faqat kichik harf, raqam va - dan iborat bo'lsin",
  })
  key!: string;

  @IsString() @MinLength(2) name!: string;

  @IsNumber() @Min(0) price!: number;

  @IsOptional() @IsString() currency?: string;

  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY', 'LIFETIME'])
  interval?: 'MONTHLY' | 'YEARLY' | 'LIFETIME';

  /** Bir vaqtda nechta so'rov ishlaydi. Yuqori chegara ataylab past —
   *  bitta qutida 64 dan ortiq parallel inference mantiqsiz. */
  @IsInt() @Min(1) @Max(64) concurrency!: number;

  @IsInt() @Min(1) @Max(100_000) rateLimitRpm!: number;

  /** 1 = eng oldin. */
  @IsInt() @Min(1) @Max(9) priority!: number;

  /** -1 = cheksiz. */
  @IsOptional() @IsInt() @Min(-1) monthlyQuota?: number;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateApiTierDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(64) concurrency?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) rateLimitRpm?: number;
  @IsOptional() @IsInt() @Min(1) @Max(9) priority?: number;
  @IsOptional() @IsInt() @Min(-1) monthlyQuota?: number;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// --- Mijoz ---

export class CreateApiConsumerDto {
  @IsString() @MinLength(2) label!: string;

  @IsOptional() @IsEmail({}, { message: "email noto'g'ri" }) email?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() tenantId?: string;
}

export class UpdateApiConsumerDto {
  @IsOptional() @IsString() @MinLength(2) label?: string;
  @IsOptional() @IsEmail({}, { message: "email noto'g'ri" }) email?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// --- Obuna ---

export class CreateApiSubscriptionDto {
  @IsString() consumerId!: string;
  @IsString() tierId!: string;

  /** Necha oyga. 0 = muddatsiz (expiresAt null). */
  @IsOptional() @IsInt() @Min(0) @Max(120) months?: number;
}

export class ChangeTierDto {
  @IsString() tierId!: string;
}

export class ExtendSubscriptionDto {
  @IsInt() @Min(1) @Max(120) months!: number;
}

export class ChangeStatusDto {
  /** EXPIRED qo'lda qo'yilmaydi — u muddatdan avtomatik kelib chiqadi. */
  @IsIn(['ACTIVE', 'SUSPENDED', 'CANCELED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'CANCELED';
}

export class CreateApiKeyDto {
  @IsOptional() @IsString() label?: string;
}
