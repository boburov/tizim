import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  sub: string; // user id yoki "super-admin"
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';
}

/** Autentifikatsiyalangan admin foydalanuvchini oladi. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
