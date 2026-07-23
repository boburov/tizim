import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser } from '../common/decorators/current-user.decorator.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Login: avval .env statik super admin tekshiriladi, keyin DB'dagi
   * 2-darajali admin userlar. Bu keyinchalik userlar qo'shishga imkon beradi.
   */
  async validateUser(email: string, password: string): Promise<AuthUser> {
    const superEmail = process.env.SUPER_ADMIN_EMAIL;
    const superHash = process.env.SUPER_ADMIN_PASSWORD_HASH;
    const superPlain = process.env.SUPER_ADMIN_PASSWORD; // faqat dev qulayligi uchun

    // --- 1) Statik super admin (.env) ---
    if (superEmail && email.toLowerCase() === superEmail.toLowerCase()) {
      let ok = false;
      if (superHash) {
        ok = await bcrypt.compare(password, superHash);
      } else if (superPlain) {
        ok = password === superPlain;
      } else {
        throw new InternalServerErrorException(
          "SUPER_ADMIN_PASSWORD_HASH yoki SUPER_ADMIN_PASSWORD .env'da yo'q",
        );
      }
      if (!ok) throw new UnauthorizedException("Email yoki parol noto'g'ri");
      return { sub: 'super-admin', email: superEmail, role: 'SUPER_ADMIN' };
    }

    // --- 2) DB'dagi 2-darajali admin userlar ---
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Email yoki parol noto'g'ri");

    return { sub: user.id, email: user.email, role: user.role };
  }

  async issueTokens(user: AuthUser) {
    const payload = { sub: user.sub, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
      expiresIn: process.env.JWT_ACCESS_TTL || '15m',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
      expiresIn: process.env.JWT_REFRESH_TTL || '7d',
    });
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
      });
      const user: AuthUser = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token yaroqsiz');
    }
  }
}
