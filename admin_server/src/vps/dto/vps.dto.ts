import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Host: IPv4, IPv6 yoki domen. Bo'shliq va shell-metabelgi YO'Q — host
 * SSH buyrug'iga to'g'ridan-to'g'ri tushmaydi (ssh2 kutubxonasi orqali),
 * lekin loglarda va nginx konfiguratsiyasida ishlatiladi.
 */
const HOST_RE = /^[A-Za-z0-9.:\-]{1,253}$/;

/** Deploy ildizi — absolyut yo'l, `..` yo'q, bo'shliq yo'q. */
const ROOT_DIR_RE = /^\/(?!.*\.\.)[A-Za-z0-9_\-./]*$/;

export class CreateVpsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @Matches(HOST_RE, { message: 'Host yaroqsiz (IP yoki domen)' })
  host!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  sshPort?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z_][a-z0-9_-]{0,31}$/, { message: 'SSH foydalanuvchi nomi yaroqsiz' })
  sshUser?: string;

  @IsOptional()
  @IsIn(['SSH_KEY', 'PASSWORD'])
  authMethod?: 'SSH_KEY' | 'PASSWORD';

  /** PEM/OpenSSH xususiy kalit — faqat yozishda keladi, hech qachon qaytarilmaydi. */
  @IsOptional()
  @IsString()
  @MaxLength(16384)
  sshPrivateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  sshPassword?: string;

  @IsOptional()
  @Matches(ROOT_DIR_RE, { message: "rootDir absolyut yo'l bo'lsin, `..` siz" })
  rootDir?: string;

  @IsOptional()
  @IsBoolean()
  isLocal?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxTenants?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * Shu VPS'dagi Postgres bazaviy URL'i: `postgresql://user:parol@host:port`.
   * Baza nomi YOZILMAYDI — u har tenant uchun qo'shiladi.
   *
   * ⚠ Ichida parol bor: shifrlanib saqlanadi va javobda HECH QACHON
   * qaytmaydi (faqat `postgresHost` — parolsiz ko'rinishi).
   * Berilmasa standart: `postgresql://postgres:postgres@127.0.0.1:5432`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  postgresBaseUrl?: string;
}

/**
 * Yangilash — hamma maydon ixtiyoriy. Sir maydonlari YUBORILSA
 * almashtiriladi, yuborilmasa TEGILMAYDI (eski sir o'qilmaydi va UI'ga
 * chiqmaydi). Sirni O'CHIRISH uchun `clearSecrets: true`.
 */
export class UpdateVpsDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @Matches(HOST_RE, { message: 'Host yaroqsiz' }) host?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) sshPort?: number;
  @IsOptional() @Matches(/^[a-z_][a-z0-9_-]{0,31}$/) sshUser?: string;
  @IsOptional() @IsIn(['SSH_KEY', 'PASSWORD']) authMethod?: 'SSH_KEY' | 'PASSWORD';
  @IsOptional() @IsString() @MaxLength(16384) sshPrivateKey?: string;
  @IsOptional() @IsString() @MaxLength(256) sshPassword?: string;
  @IsOptional() @IsBoolean() clearSecrets?: boolean;
  @IsOptional() @Matches(ROOT_DIR_RE) rootDir?: string;
  @IsOptional() @IsBoolean() isLocal?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxTenants?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(500) postgresBaseUrl?: string;
}

/** Tenantni VPS'ga biriktirish (`PATCH /tenants/:id/vps`). */
export class AssignVpsDto {
  @IsString()
  @MinLength(1)
  vpsId!: string;
}
