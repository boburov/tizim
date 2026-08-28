import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthUser } from '../common/decorators/current-user.decorator.js';

/** Access tokenni Authorization header yoki access_token cookie'dan oladi. */
const cookieExtractor = (req: Request): string | null => {
  if (req?.cookies?.access_token) return req.cookies.access_token;
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    });
  }

  async validate(payload: any): Promise<AuthUser> {
    // ⚠ MIJOZ TOKENI ADMIN BO'LA OLMAYDI.
    //
    // Ikkala token bir xil `JWT_ACCESS_SECRET` bilan imzolanadi va ularni
    // faqat `aud` ajratadi. Quyidagi `role` sharti mijoz tokenini hozir
    // ham to'sadi (unda `role` yo'q), lekin bu TASODIF — mijoz payload'iga
    // biror kun `role` qo'shilsa, himoya jimgina yo'qolardi. Shuning uchun
    // shart OCHIQ yozilgan.
    if (payload?.aud === 'customer') {
      throw new UnauthorizedException('Token turi mos emas');
    }
    if (!payload?.sub || !payload?.role) {
      throw new UnauthorizedException('Yaroqsiz token');
    }
    return { sub: payload.sub, email: payload.email, role: payload.role };
  }
}
