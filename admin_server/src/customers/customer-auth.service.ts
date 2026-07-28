import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  SignupDto,
} from './dto/customer-auth.dto.js';

/**
 * Mijoz (self-service) autentifikatsiyasi.
 *
 * MUHIM: mijoz tokeni admin tokenidan ATAYIN farq qiladi — `aud: "customer"`
 * qo'yiladi va CustomerJwtGuard faqat shuni qabul qiladi. Shunda mijoz
 * tokeni bilan admin marshrutlariga (yoki aksincha) kirib bo'lmaydi.
 */
export const CUSTOMER_AUDIENCE = 'customer';

export interface CustomerPayload {
  sub: string;
  email: string;
  aud: string;
}

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private get accessSecret() {
    return process.env.JWT_ACCESS_SECRET || 'dev-access-secret';
  }
  private get refreshSecret() {
    return process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
  }

  async signup(dto: SignupDto) {
    const email = dto.email.toLowerCase().trim();

    const exists = await this.prisma.customer.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Bu email allaqachon ro\'yxatdan o\'tgan');

    // Super admin emaili bilan mijoz ro'yxatdan o'tolmasin (chalkashlik bo'lmasin)
    if (
      process.env.SUPER_ADMIN_EMAIL &&
      email === process.env.SUPER_ADMIN_EMAIL.toLowerCase()
    ) {
      throw new ConflictException('Bu email band');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const verifyToken = randomBytes(32).toString('hex');

    const customer = await this.prisma.customer.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        companyName: dto.companyName,
        verifyToken,
        // Email yuborish sozlanmagan bo'lsa darrov tasdiqlangan deb hisoblaymiz,
        // aks holda hech kim tizimga kira olmaydi.
        emailVerified: !this.emailEnabled(),
      },
      select: { id: true, email: true, fullName: true, emailVerified: true },
    });

    if (this.emailEnabled()) {
      // TODO: haqiqiy email yuborish (SMTP sozlangach)
      this.logger.log(
        `Tasdiqlash tokeni (${email}): ${verifyToken} — email hali ulanmagan`,
      );
    }

    return {
      customer,
      // Email o'chiq bo'lsa tokenni qaytaramiz (dev qulayligi)
      verifyToken: this.emailEnabled() ? undefined : verifyToken,
    };
  }

  private emailEnabled() {
    return Boolean(process.env.SMTP_HOST);
  }

  /**
   * Google orqali kirish/ro'yxatdan o'tish.
   *
   * Uch holat:
   *   1. googleId bo'yicha topildi  → shu hisobga kiramiz.
   *   2. email bo'yicha topildi     → mavjud hisobga Google'ni BOG'LAYMIZ.
   *   3. hech narsa topilmadi       → yangi hisob yaratamiz.
   *
   * XAVFSIZLIK: 2-holatda Google emaili TASDIQLANGAN bo'lishi shart.
   * Aks holda hujumchi tasdiqlanmagan email bilan Google hisobi ochib,
   * begona odamning mavjud hisobiga kirib olishi mumkin edi.
   */
  async loginWithGoogle(profile: {
    googleId: string;
    email: string;
    fullName?: string;
    avatarUrl?: string;
    emailVerified: boolean;
  }) {
    const email = profile.email.toLowerCase().trim();

    // Super admin emaili bilan mijoz hisobi ochilmasin (signup bilan bir xil qoida).
    if (
      process.env.SUPER_ADMIN_EMAIL &&
      email === process.env.SUPER_ADMIN_EMAIL.toLowerCase()
    ) {
      throw new UnauthorizedException('Bu email band');
    }

    // 1. Avval googleId bo'yicha
    const byGoogle = await this.prisma.customer.findUnique({
      where: { googleId: profile.googleId },
    });
    if (byGoogle) {
      if (!byGoogle.isActive) throw new UnauthorizedException('Hisob faol emas');
      return byGoogle;
    }

    // 2. Email bo'yicha — mavjud hisobga bog'lash
    const byEmail = await this.prisma.customer.findUnique({ where: { email } });
    if (byEmail) {
      if (!byEmail.isActive) throw new UnauthorizedException('Hisob faol emas');
      if (!profile.emailVerified) {
        throw new UnauthorizedException(
          'Google hisobingizdagi email tasdiqlanmagan — parol bilan kiring',
        );
      }
      return this.prisma.customer.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          avatarUrl: byEmail.avatarUrl || profile.avatarUrl,
          // Google emailni tasdiqlagan bo'lsa bizda ham tasdiqlangan hisoblanadi.
          emailVerified: true,
          verifyToken: null,
        },
      });
    }

    // 3. Yangi hisob. Parol yo'q — faqat Google orqali kiradi.
    return this.prisma.customer.create({
      data: {
        email,
        googleId: profile.googleId,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl,
        emailVerified: profile.emailVerified,
      },
    });
  }

  async validate(email: string, password: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri");
    }
    // Google orqali ochilgan hisobda parol yo'q.
    if (!customer.passwordHash) {
      throw new UnauthorizedException(
        'Bu hisob Google orqali ochilgan — Google bilan kiring',
      );
    }
    const ok = await bcrypt.compare(password, customer.passwordHash);
    if (!ok) throw new UnauthorizedException("Email yoki parol noto'g'ri");
    if (!customer.emailVerified) {
      throw new UnauthorizedException('Email tasdiqlanmagan');
    }
    return customer;
  }

  async issueTokens(customer: { id: string; email: string }) {
    const payload = {
      sub: customer.id,
      email: customer.email,
      aud: CUSTOMER_AUDIENCE,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: process.env.JWT_ACCESS_TTL || '15m',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: process.env.JWT_REFRESH_TTL || '7d',
    });
    return { accessToken, refreshToken };
  }

  async refresh(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.refreshSecret,
      });
      if (payload.aud !== CUSTOMER_AUDIENCE) {
        throw new UnauthorizedException('Token turi mos emas');
      }
      // Mijoz o'chirilgan/bloklangan bo'lsa refresh ishlamasin
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, isActive: true },
      });
      if (!customer || !customer.isActive) {
        throw new UnauthorizedException('Hisob faol emas');
      }
      return this.issueTokens(customer);
    } catch {
      throw new UnauthorizedException('Refresh token yaroqsiz');
    }
  }

  async verifyEmail(token: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { verifyToken: token },
    });
    if (!customer) throw new UnauthorizedException("Token yaroqsiz");

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { emailVerified: true, verifyToken: null },
    });
    return { ok: true };
  }

  /**
   * Parolni tiklash so'rovi. Email mavjudligini OSHKOR QILMAYDI —
   * aks holda bu endpoint orqali ro'yxatdagi emaillarni aniqlash mumkin bo'lardi.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const customer = await this.prisma.customer.findUnique({ where: { email } });

    if (customer) {
      const resetToken = randomBytes(32).toString('hex');
      const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1 soat
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { resetToken, resetTokenExp },
      });
      this.logger.log(`Parol tiklash tokeni (${email}): ${resetToken}`);
    }

    return {
      ok: true,
      message: "Agar bu email ro'yxatda bo'lsa, tiklash havolasi yuborildi",
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { resetToken: dto.token },
    });
    if (!customer || !customer.resetTokenExp || customer.resetTokenExp < new Date()) {
      throw new UnauthorizedException("Token yaroqsiz yoki muddati o'tgan");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash, resetToken: null, resetTokenExp: null },
    });
    return { ok: true };
  }
}
