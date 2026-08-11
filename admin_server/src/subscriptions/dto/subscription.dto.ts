import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Sinov muddati chegaralari — biznes qoidasi, UI ham shu raqamlarni ko'rsatadi. */
export const TRIAL_MIN_DAYS = 1;
export const TRIAL_MAX_DAYS = 30;

/**
 * Bepul sinov berish.
 *
 * Muddat 1-30 kun bilan CHEKLANGAN: sinov "cheksiz bepul"ga aylanib
 * ketmasligi kerak. Uzoqroq kerak bo'lsa — tarif biriktiriladi, sinov emas.
 */
export class GrantTrialDto {
  @IsInt()
  @Min(TRIAL_MIN_DAYS)
  @Max(TRIAL_MAX_DAYS)
  days!: number;

  /** Qaysi tarif imkoniyatlari bilan. Berilmasa mavjud/eng arzon tarif. */
  @IsOptional() @IsString() planKey?: string;

  /** "Direktor bilan kelishildi", "ko'rgazma uchun" kabi izoh. */
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class SuspendTenantDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
