import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { CUSTOMER_AUDIENCE } from '../../customers/customer-auth.service.js';

export interface CustomerRequest extends Request {
  customer?: { sub: string; email: string };
}

/**
 * Mijoz (client panel) tokenini tekshiradi.
 *
 * Admin JwtAuthGuard'dan ATAYIN alohida: bu yerda `aud === "customer"`
 * shart qilib qo'yilgan. Admin tokenida bu maydon yo'q, shuning uchun
 * admin tokeni bilan mijoz marshrutlariga kirib bo'lmaydi va aksincha.
 */
@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CustomerRequest>();

    const fromCookie = req.cookies?.customer_access_token;
    const header = req.headers.authorization;
    const fromHeader = header?.startsWith('Bearer ')
      ? header.slice(7)
      : undefined;
    const token = fromCookie || fromHeader;

    if (!token) throw new UnauthorizedException('Avtorizatsiyadan o\'tilmagan');

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
      });
      if (payload.aud !== CUSTOMER_AUDIENCE) {
        throw new UnauthorizedException('Token turi mos emas');
      }
      req.customer = { sub: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Token yaroqsiz');
    }
  }
}

/** Joriy mijozni oladi. */
export const currentCustomer = (req: CustomerRequest) => {
  if (!req.customer) throw new UnauthorizedException('Mijoz topilmadi');
  return req.customer;
};
