import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Telegram bot tokenining shakli: "<bot_id>:<35 belgi>". */
const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;

/** .env kaliti — bash uchun xavfsiz shakl. */
const ENV_KEY_RE = /^[A-Z][A-Z0-9_]{0,48}$/;

export class CreateBotDto {
  @IsString() @MinLength(2) name!: string;

  /**
   * Bo'sh qoldirilsa nomdan hosil qilinadi. Berilsa shu ishlatiladi —
   * u subdomen, pm2 nomi va papka nomi bo'lgani uchun qat'iy shaklda.
   */
  @IsOptional()
  @Matches(/^[a-z][a-z0-9-]{1,30}$/, {
    message: "slug kichik harf bilan boshlanib, faqat harf/raqam/- dan iborat bo'lsin",
  })
  slug?: string;

  @IsIn(['NODEJS', 'PHP'])
  runtime!: 'NODEJS' | 'PHP';

  @IsIn(['REPO', 'TEMPLATE'])
  source!: 'REPO' | 'TEMPLATE';

  /**
   * Token shaklini shu yerda tekshiramiz, lekin haqiqiyligini servis
   * Telegram `getMe` orqali tekshiradi — shakli to'g'ri, o'zi yaroqsiz
   * token eng ko'p uchraydigan holat.
   */
  @Matches(TOKEN_RE, { message: "Token shakli noto'g'ri (123456:AA...)" })
  token!: string;

  // --- source = REPO ---
  @IsOptional() @IsString() repoUrl?: string;
  @IsOptional() @IsString() repoBranch?: string;

  // --- source = TEMPLATE ---
  @IsOptional() @IsString() templateId?: string;

  // --- ixtiyoriy bog'lanish ---
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() customerId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BotEnvItemDto)
  env?: BotEnvItemDto[];
}

export class BotEnvItemDto {
  @Matches(ENV_KEY_RE, {
    message: "kalit KATTA harf, raqam va _ dan iborat bo'lsin",
  })
  key!: string;

  @IsString() value!: string;

  @IsOptional() @IsBoolean() isSecret?: boolean;
}

export class UpdateBotDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;

  /** Token almashtirish — berilsa qayta tekshiriladi. */
  @IsOptional()
  @Matches(TOKEN_RE, { message: "Token shakli noto'g'ri (123456:AA...)" })
  token?: string;

  @IsOptional() @IsString() repoUrl?: string;
  @IsOptional() @IsString() repoBranch?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() customerId?: string;
}

export class ReplaceEnvDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BotEnvItemDto)
  items!: BotEnvItemDto[];
}

export class LogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(2000)
  lines?: number;
}
