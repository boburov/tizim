import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail({}, { message: "Email noto'g'ri" })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 belgi' })
  password!: string;

  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() companyName?: string;
}

export class CustomerLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Parol kiritilishi shart' })
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 belgi' })
  password!: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() companyName?: string;
}
