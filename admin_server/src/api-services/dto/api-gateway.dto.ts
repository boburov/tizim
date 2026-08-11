import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AuthorizeDto {
  @IsString() @MinLength(10) key!: string;
}

/** Bitta kunlik hisob qatori — data plane buferidan keladi. */
export class UsageItemDto {
  @IsString() subscriptionId!: string;

  /** "YYYY-MM-DD" — data plane o'z mahalliy sanasini yuboradi. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'day "YYYY-MM-DD" bo\'lsin' })
  day!: string;

  @IsOptional() @IsString() endpoint?: string;

  @IsInt() @Min(0) ok!: number;
  @IsInt() @Min(0) rejected!: number;
  @IsInt() @Min(0) failed!: number;
  @IsInt() @Min(0) totalMs!: number;
}

export class IngestUsageDto {
  /** Bitta batchda chegara — buzilgan yoki yovuz klient bazani ko'mmasin. */
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => UsageItemDto)
  items!: UsageItemDto[];
}

/**
 * BITTA so'rovning hisobi.
 *
 * Batch yig'ib yubora olmaydigan (yoki yig'ishni xohlamaydigan) xizmatlar
 * uchun: har so'rovdan keyin shu endpoint chaqiriladi. Aniqroq, lekin
 * qimmatroq — sekundiga 10 dan ko'p so'rov bo'lsa batch afzal.
 */
export class MeterRequestDto {
  @IsString() subscriptionId!: string;

  @IsOptional() @IsString() endpoint?: string;

  /** So'rov natijasi — qaysi hisoblagich oshishini shu belgilaydi. */
  @IsIn(['ok', 'rejected', 'failed'])
  outcome!: 'ok' | 'rejected' | 'failed';

  /** So'rovga ketgan vaqt (ms) — o'rtacha latency shundan chiqadi. */
  @IsOptional() @IsInt() @Min(0) ms?: number;

  /** "YYYY-MM-DD". Berilmasa admin serverning bugungi sanasi olinadi. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'day "YYYY-MM-DD" bo\'lsin' })
  day?: string;
}
