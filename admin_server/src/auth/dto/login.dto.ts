import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email yaroqsiz' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgi' })
  password!: string;
}
