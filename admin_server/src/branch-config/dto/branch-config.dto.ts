import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { BRANCH_LIMIT_MAX, UNLIMITED } from '../branch-config.constants.js';

/**
 * Filial konfiguratsiyasini o'zgartirish — FAQAT Developer Admin.
 *
 * ⚠ Bu DTO mijoz oqimida (self-service) HECH QACHON ishlatilmaydi.
 * Mijoz o'z chegarasini o'zgartira olsa, paywall'ning ma'nosi qolmasdi.
 */
export class UpdateBranchConfigDto {
  /** Ko'p filialli rejim yoqilsinmi. */
  @IsOptional()
  @IsBoolean()
  branchesEnabled?: boolean;

  /**
   * Yangi chegara.
   *   son (1..MAX) — qo'lda qo'yiladi
   *   -1           — cheksiz
   *   null         — qo'lda qo'yilgani BEKOR qilinadi, tarif/standart amal qiladi
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt({ message: "Filial chegarasi butun son bo'lishi kerak" })
  branchLimit?: number | null;

  /**
   * NEGA o'zgartirildi — audit yozuviga tushadi.
   *
   * ⚠ MAJBURIY EMAS, ataylab. Majburiy qilinsa, shoshgan odam "test",
   * "ok" deb yozib o'tardi va maydon ma'nosini yo'qotardi. Bo'sh sabab
   * "sabab yozilmagan" degan HALOL ma'lumot.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Filial chegarasini bittalab o'zgartirish (panel "+/-" tugmalari). */
export class AdjustBranchLimitDto {
  /**
   * Qo'shiladigan (manfiy bo'lsa — ayiriladigan) filiallar soni.
   * Chegara sifatida `BRANCH_LIMIT_MAX` ishlatiladi: bitta so'rov bilan
   * chegarani osmonga chiqarib yuborish mumkin bo'lmasin.
   */
  @IsInt()
  delta!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Pullik filial paketini biriktirish. */
export class GrantBranchAddonDto {
  @IsString()
  @Matches(/^[a-z0-9_-]{2,40}$/, { message: "Paket kaliti noto'g'ri" })
  addonKey!: string;

  /**
   * Necha marta sotib olinmoqda. Standart 1.
   *
   * ⚠ MAVJUD MIQDOR USTIGA QO'SHILADI. "+5" ni ikki marta sotib olgan
   * mijoz 10 ta qo'shimcha filial oladi — bu ikkinchi XARID, birinchisining
   * tuzatilishi emas.
   */
  @IsOptional()
  @IsInt({ message: "Miqdor butun son bo'lishi kerak" })
  @Min(1, { message: "Miqdor kamida 1 bo'lishi kerak" })
  quantity?: number;

  /** Bo'sh bo'lsa — muddatsiz (obuna bilan birga yashaydi). */
  @IsOptional()
  @IsDateString({}, { message: "Muddat sanasi ISO formatda bo'lishi kerak" })
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Paketni olib qo'yish — sabab bilan. */
export class RevokeBranchAddonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export const BRANCH_LIMIT_BOUNDS = { max: BRANCH_LIMIT_MAX, unlimited: UNLIMITED };
