import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2, { message: 'Nom kamida 2 belgi' })
  name!: string;

  // Domen formatini tekshirish (masalan markaz.example.uz)
  @IsString()
  @Matches(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, {
    message: 'Domen yaroqsiz (masalan: markaz.example.uz)',
  })
  domain!: string;

  @IsHexColor({ message: "Brend rang hex bo'lishi kerak (masalan #4f46e5)" })
  brandColor!: string;

  // Qolgan brend ranglari ixtiyoriy — berilmasa tenant client ularni
  // brandColor'dan avtomatik hosil qiladi.
  @IsOptional()
  @IsHexColor({ message: "Fon rangi hex bo'lishi kerak" })
  brandBackground?: string;

  @IsOptional()
  @IsHexColor({ message: "Dark rejim brend rangi hex bo'lishi kerak" })
  brandColorDark?: string;

  @IsOptional()
  @IsHexColor({ message: "Dark rejim fon rangi hex bo'lishi kerak" })
  brandBackgroundDark?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  botToken?: string;

  @IsString()
  systemTemplateId!: string;

  /**
   * GitHub repo ochilsinmi. Standart — ochilsin (integratsiya sozlangan
   * bo'lsa). Mijoz kodini repoga qo'ymaslikni so'rasa false beriladi.
   */
  @IsOptional()
  @IsBoolean()
  createRepo?: boolean;

  // ────────────────────────────────────────────────────────── FILIALLAR
  //
  // ⚠⚠ BU IKKI MAYDON FAQAT DEVELOPER ADMIN OQIMIDA O'QILADI.
  //
  // Shu DTO mijozning self-service yo'lida ham ishlatiladi
  // (`POST /customers/tenants`). O'sha yerda maydonlar ATAYLAB
  // TASHLAB YUBORILADI (`customers.service.ts` → `createTenant`) —
  // aks holda mijoz ro'yxatdan o'tayotib o'ziga 1000 ta filial
  // yozib qo'yardi. Xato emas, JIMGINA TASHLANADI: mijoz umuman
  // bilmasligi kerak bo'lgan maydon uchun 400 qaytarish uni
  // maydonning borligidan xabardor qilardi.

  /** Ko'p filialli rejim. Berilmasa — yoqilgan (standart). */
  @IsOptional()
  @IsBoolean()
  branchesEnabled?: boolean;

  /**
   * Boshlang'ich filial chegarasi. Berilmasa `null` bo'lib qoladi va
   * tarif/tizim standarti (DEFAULT_BRANCH_LIMIT) amal qiladi — ya'ni
   * yangi loyiha standart holda 5 ta filial bilan boshlaydi.
   */
  @IsOptional()
  @IsInt()
  branchLimit?: number;
}
