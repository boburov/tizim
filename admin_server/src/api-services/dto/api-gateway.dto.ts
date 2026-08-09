import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
