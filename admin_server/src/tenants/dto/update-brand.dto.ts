import {
  IsHexColor,
  IsOptional,
  IsString,
  MinLength,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/**
 * `IsHexColor` bo'sh satrni rad etadi, bizga esa "bu rangni olib tashla"
 * ma'nosidagi bo'sh qiymat kerak: berilmagan rangni tenant client brend
 * rangidan O'ZI hosil qiladi (kontrastni kafolatlab). Shuning uchun
 * "hex yoki bo'sh" tekshiruvi.
 */
function HexOrEmpty(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'hexOrEmpty',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === '' || value === null || value === undefined) return true;
          return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
        },
      },
    });
  };
}

/**
 * Brend tahriri. Bo'sh satr ("") — rangni olib tashlash;
 * maydonning umuman berilmasligi — "tegilmasin".
 */
export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nom kamida 2 belgi' })
  name?: string;

  @IsOptional()
  @IsHexColor({ message: "Brend rang hex bo'lishi kerak (masalan #4f46e5)" })
  brandColor?: string;

  @IsOptional()
  @IsString()
  @HexOrEmpty({ message: "Fon rangi hex bo'lishi kerak yoki bo'sh" })
  brandBackground?: string;

  @IsOptional()
  @IsString()
  @HexOrEmpty({ message: "Dark rejim brend rangi hex bo'lishi kerak yoki bo'sh" })
  brandColorDark?: string;

  @IsOptional()
  @IsString()
  @HexOrEmpty({ message: "Dark rejim fon rangi hex bo'lishi kerak yoki bo'sh" })
  brandBackgroundDark?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
