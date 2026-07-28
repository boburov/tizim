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

  /**
   * Cookie'lardagi access tokenlarni tekshirib, joriy sessiyani aniqlaydi.
   *
   * Admin tokeni ustun turadi: super admin o'z brauzerida mijoz kabinetini
   * ham ochgan bo'lishi mumkin, bunday holda admin sifatida ko'rsatiladi.
   * Hech biri yaroqli bo'lmasa null.
   */
  async resolveSession(tokens: {
    adminToken?: string;
    customerToken?: string;
  }) {
    const accessSecret = process.env.JWT_ACCESS_SECRET || 'dev-access-secret';

    if (tokens.adminToken) {
      try {
        const p = await this.jwt.verifyAsync(tokens.adminToken, {
          secret: accessSecret,
        });
        // Mijoz tokeni `aud: "customer"` bilan keladi — u admin sifatida
        // qabul qilinmasligi SHART (ikkala token bir xil secret bilan
        // imzolanadi, farqi faqat shu maydonda).
        if (p.aud !== 'customer') {
          return {
            kind: 'admin' as const,
            user: { sub: p.sub, email: p.email, role: p.role } as AuthUser,
          };
        }
      } catch {
        // yaroqsiz — pastda mijozni sinaymiz
      }
    }

    if (tokens.customerToken) {
      try {
        const p = await this.jwt.verifyAsync(tokens.customerToken, {
          secret: accessSecret,
        });
        if (p.aud !== 'customer') return null;

        const customer = await this.prisma.customer.findUnique({
          where: { id: p.sub },
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            isActive: true,
          },
        });
        if (!customer || !customer.isActive) return null;

        const { isActive, ...rest } = customer;
        return { kind: 'customer' as const, customer: rest };
      } catch {
        return null;
      }
    }

    return null;
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
