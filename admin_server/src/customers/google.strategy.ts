import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';

export const GOOGLE_STRATEGY = 'customer-google';

/** Google OAuth sozlanganmi (kalitlar .env da bormi). */
export const googleEnabled = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export interface GoogleProfile {
  googleId: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

/**
 * Google orqali kirish (faqat MIJOZLAR uchun — adminlar emas).
 *
 * MUHIM: Google profilida `email_verified` false bo'lishi mumkin (kamdan-kam,
 * lekin Workspace hisoblarida uchraydi). Bunday emailga ishonib bo'lmaydi —
 * aks holda birov tasdiqlanmagan email bilan mavjud hisobga ulanib olishi
 * mumkin edi. Shuning uchun uni pastda service tekshiradi.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, GOOGLE_STRATEGY) {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'disabled',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'disabled',
      // Bu manzil Google Cloud Console'dagi "Authorized redirect URI" bilan
      // AYNAN bir xil bo'lishi shart, aks holda redirect_uri_mismatch xatosi.
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        `http://localhost:${process.env.PORT || 4000}/api/customer/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  // MUHIM: @nestjs/passport `validate` QAYTARGAN qiymatni olib, passport'ning
  // `done`'ini o'zi chaqiradi. Shu bois bu yerda `done`'ni QO'LDA chaqirmaymiz —
  // aks holda `done` ikki marta ishlaydi (bir marta biz, bir marta wrapper):
  // avval success(user), keyin success qaytargan undefined bilan fail(). Natijada
  // callback ikki marta chaqirilib, Google login "headers already sent" bilan
  // yiqilardi. To'g'ri usul — faqat qiymat qaytarish yoki xato tashlash.
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): GoogleProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException('Google hisobida email topilmadi');
    }

    // passport-google-oauth20 `verified` ni string yoki boolean qaytarishi
    // mumkin — ikkalasini ham hisobga olamiz.
    const rawVerified = profile.emails?.[0]?.verified as unknown;
    const emailVerified = rawVerified === true || rawVerified === 'true';

    return {
      googleId: profile.id,
      email: email.toLowerCase().trim(),
      fullName: profile.displayName || undefined,
      avatarUrl: profile.photos?.[0]?.value,
      emailVerified,
    };
  }
}
