import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';

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

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('Google hisobida email topilmadi'), undefined);
    }

    // passport-google-oauth20 `verified` ni string yoki boolean qaytarishi
    // mumkin — ikkalasini ham hisobga olamiz.
    const rawVerified = profile.emails?.[0]?.verified as unknown;
    const emailVerified = rawVerified === true || rawVerified === 'true';

    const user: GoogleProfile = {
      googleId: profile.id,
      email: email.toLowerCase().trim(),
      fullName: profile.displayName || undefined,
      avatarUrl: profile.photos?.[0]?.value,
      emailVerified,
    };

    return done(null, user);
  }
}
