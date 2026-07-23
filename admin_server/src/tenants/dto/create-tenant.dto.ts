import {
  IsHexColor,
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

  @IsHexColor({ message: 'Brend rang hex bo\'lishi kerak (masalan #4f46e5)' })
  brandColor!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  botToken?: string;

  @IsString()
  systemTemplateId!: string;
}
