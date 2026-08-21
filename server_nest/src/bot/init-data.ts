import crypto from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELEGRAM WebApp `initData` HMAC TEKSHIRUVI —
 * `server/src/bot/utils/initData.js` NING AYNAN KO'CHIRMASI.
 *
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * ⚠ BU FUNKSIYA AUTENTIFIKATSIYA CHEGARASI. `/api/bot-auth/verify`
 * marshrutida BOSHQA himoya YO'Q — initData imzosining o'zi
 * "bu odam haqiqatan Telegram orqali keldi" degan yagona dalil.
 * Shuning uchun tekshiruvni "soddalashtirish" — autentifikatsiyani
 * o'chirish bilan barobar.
 *
 * ── NEGA TO'RTTA NOMZOD CHECK-STRING ──
 *
 * Telegram versiyalari orasida ikkita o'lchov bo'yicha farq bor:
 *   A) `signature` (Ed25519) maydoni HMAC hisobiga KIRADIMI yoki YO'Q;
 *   B) qiymatlar DEKODLANGANmi yoki XOM (encoded) holidami.
 * `URLSearchParams` qiymatlarni dekodlaydi va `+` ni bo'sh joyga
 * aylantiradi — ba'zi initData'larda bu check-string'ni buzadi.
 * Bittasi mos kelsa yetarli; nomzodlarni kamaytirish ba'zi mijoz
 * versiyalarida kirishni JIMGINA yopib qo'yardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type InitDataUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export type InitDataResult =
  | { ok: true; user: InitDataUser; authDate: number }
  | {
      ok: false;
      reason: string;
      debug?: Record<string, string>;
    };

export const verifyInitData = (
  initData: string,
  botToken: string | string[],
  maxAgeSec = 86400,
): InitDataResult => {
  const tokens = (Array.isArray(botToken) ? botToken : [botToken]).filter(Boolean);
  if (!initData || tokens.length === 0) return { ok: false, reason: 'missing-input' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'bad-format' };
  }

  const hash = (params.get('hash') || '').toLowerCase();
  if (!hash) return { ok: false, reason: 'no-hash' };

  // Dekodlangan variant (URLSearchParams).
  const buildDecoded = (excludeSignature: boolean): string => {
    const p = new URLSearchParams(initData);
    p.delete('hash');
    if (excludeSignature) p.delete('signature');
    return [...p.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
  };

  // XOM variant: qo'lda parse, qiymatlar o'zgartirilmaydi.
  const rawPairs = initData
    .split('&')
    .map((part): [string, string] => {
      const i = part.indexOf('=');
      return i === -1 ? [part, ''] : [part.slice(0, i), part.slice(i + 1)];
    })
    .filter(([k]) => k && k !== 'hash');
  const buildRaw = (excludeSignature: boolean): string =>
    rawPairs
      .filter(([k]) => !(excludeSignature && k === 'signature'))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

  const candidates = [buildDecoded(true), buildDecoded(false), buildRaw(true), buildRaw(false)];

  let computedSample = '';
  const matches = tokens.some((token) => {
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    return candidates.some((checkString) => {
      const computed = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
      if (!computedSample) computedSample = computed;
      return computed === hash;
    });
  });

  if (!matches) {
    return {
      ok: false,
      reason: 'bad-hash',
      // Diagnostika: nega mos kelmaganini ko'rish uchun. Token (sir)
      // EMAS, faqat HMAC natijasi va kalitlar ro'yxati.
      debug: {
        receivedHash: hash,
        computedHash: computedSample,
        keys: [...params.keys()].sort().join(','),
        checkStringHead: candidates[0].slice(0, 80),
      },
    };
  }

  // ⚠ ESKIRISH TEKSHIRUVI IMZODAN KEYIN, LEKIN MAJBURIY. Imzo to'g'ri
  // bo'lsa ham eski initData qayta ishlatilishi (replay) mumkin.
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) return { ok: false, reason: 'no-auth-date' };
  if (Date.now() / 1000 - authDate > maxAgeSec) return { ok: false, reason: 'expired' };

  let user: InitDataUser | null = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return { ok: false, reason: 'bad-user' };
  }
  if (!user?.id) return { ok: false, reason: 'no-user' };

  return { ok: true, user, authDate };
};

/**
 * `initData` dan Telegram foydalanuvchisini HMAC TEKSHIRUVISIZ ajratadi.
 *
 * ⚠⚠ AUTENTIFIKATSIYA UCHUN ISHLATILMAYDI. Faqat allaqachon boshqa yo'l
 * bilan (parol) tasdiqlangan oqimda diagnostika/fallback uchun.
 * Express'da ham aynan shu cheklov bilan turadi.
 */
export const parseInitDataUserUnsafe = (initData: string): InitDataUser | null => {
  try {
    const p = new URLSearchParams(initData);
    const u = JSON.parse(p.get('user') || 'null');
    return u && u.id ? u : null;
  } catch {
    return null;
  }
};
