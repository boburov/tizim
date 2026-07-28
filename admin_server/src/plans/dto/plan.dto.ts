import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const KEY_RE = /^[a-z][a-z0-9_]{1,48}$/;

// --- Feature ---
export class CreateFeatureDto {
  @Matches(KEY_RE, {
    message: "key faqat kichik harf, raqam va _ dan iborat bo'lsin",
  })
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['LIMIT', 'BOOLEAN'])
  type!: 'LIMIT' | 'BOOLEAN';

  @IsOptional()
  @IsString()
  unit?: string;

  /** Heartbeat metrikasi bilan bog'lash (masalan "user_count"). */
  @IsOptional()
  @IsString()
  metricKey?: string;
}

export class UpdateFeatureDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() metricKey?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// --- Plan ---
export class PlanFeatureValueDto {
  @IsString()
  featureKey!: string;

  /** -1 = cheksiz. BOOLEAN uchun 0 yoki 1. */
  @IsInt()
  @Min(-1)
  value!: number;
}

export class CreatePlanDto {
  @Matches(KEY_RE, {
    message: "key faqat kichik harf, raqam va _ dan iborat bo'lsin",
  })
  key!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsString() description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional() @IsString() currency?: string;

  @IsIn(['MONTHLY', 'YEARLY', 'LIFETIME'])
  interval!: 'MONTHLY' | 'YEARLY' | 'LIFETIME';

  @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isPublic?: boolean;

  /** Tarif limitlari. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureValueDto)
  features?: PlanFeatureValueDto[];
}

export class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsIn(['MONTHLY', 'YEARLY', 'LIFETIME']) interval?: 'MONTHLY' | 'YEARLY' | 'LIFETIME';
  @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureValueDto)
  features?: PlanFeatureValueDto[];
}

// --- Obunani tenantga biriktirish ---
export class AssignPlanDto {
  @IsString()
  planKey!: string;

  /** Necha kunga (bo'lmasa tarif intervalidan hisoblanadi). */
  @IsOptional() @IsInt() @Min(1) days?: number;
}
