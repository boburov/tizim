import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * EGA HISOBI UCHUN QOIDALAR — YAGONA MANBA.
 *
 * Ham tenant yaratish formasida, ham "ega yaratish" tugmasida ayni shu
 * cheklovlar amal qiladi.
 */

/**
 * Login. Tenant tomonida `username` YAGONA unique maydon va u
 * `POST /auth/login` ning kalitidir — bo'sh joy yoki katta harf
 * kiritilsa mijoz kira olmay qoladi va sababi ko'rinmaydi.
 */
export const OWNER_USERNAME_RULE = /^[a-z0-9._-]{3,32}$/;

/** Parol uzunligi — tenant `changePassword` bilan bir xil chegara. */
export const OWNER_PASSWORD_MIN = 8;

export class TenantOwnerCredentialsDto {
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

/** Parolni almashtirish — login o'zgarmaydi. */
export class SetOwnerPasswordDto {
  @IsString()
  @MinLength(OWNER_PASSWORD_MIN, {
    message: `Parol kamida ${OWNER_PASSWORD_MIN} belgi`,
  })
  @MaxLength(128)
  password!: string;
}
