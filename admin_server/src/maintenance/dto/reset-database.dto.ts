import { IsIn, IsString, MinLength } from 'class-validator';

export class ResetDatabaseDto {
  /** Xavfsizlik uchun aynan "DELETE" so'zi yozilishi shart. */
  @IsIn(['DELETE'], { message: "Tasdiqlash uchun DELETE so'zini yozing" })
  confirm!: string;

  /** Super adminning joriy paroli — backendda qayta tekshiriladi. */
  @IsString()
  @MinLength(1, { message: 'Parol kiritilishi shart' })
  password!: string;
}
