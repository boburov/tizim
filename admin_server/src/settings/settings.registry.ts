/**
 * TENANT SOZLAMALARI KATALOGI.
 *
 * Har tenantning `.env` fayli shu ro'yxatdan quriladi. Bitta joyda:
 * kalit, turi, standart qiymati, validatsiyasi, UI matni va o'zgarish
 * QANDAY yetkazilishi (pm2 restart / client rebuild).
 *
 * NEGA KOD, DB EMAS: ro'yxat kod bilan birga versiyalanadi va tenant
 * ilovasi haqiqatda o'qiydigan o'zgaruvchilar bilan bir joyda turadi.
 * DB katalogida esa ilova hech qachon o'qimaydigan "o'lik" sozlama
 * qo'shib qo'yish mumkin — panelda ko'rinadi, ta'siri esa yo'q.
 *
 * YANGI SOZLAMA QO'SHISH:
 *   1) tenant ilovasida `process.env.X` ni o'qiydigan joyni yozing;
 *   2) shu ro'yxatga bitta yozuv qo'shing;
 *   3) tamom — admin panelda maydon o'zi paydo bo'ladi, .env ga o'zi tushadi.
 *
 * BU YERDA YO'Q narsalar (ataylab): DATABASE_URL, PORT, JWT sirlari, CLIENT_URL,
 * COOKIE_DOMAIN, heartbeat kalitlari va brend ranglari. Ular tenant yozuvidan
 * HOSIL QILINADI (`settings.service.ts` → `buildManagedValues`), qo'lda
 * o'zgartirilmaydi: noto'g'ri qiymat tenantni butunlay ishdan chiqaradi.
 */

export type SettingScope = 'server' | 'client';

export type SettingType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'secret' // bazada shifrlanadi, UI'da niqoblanadi
  | 'select';

/**
 * O'zgarish tenantga qanday yetadi:
 *   restart — server .env qayta yoziladi + `pm2 restart` (bir necha soniya)
 *   rebuild — client .env qayta yoziladi + `npm run build` (1-2 daqiqa)
 *   none    — faqat yozuv, ishlayotgan jarayonga ta'sir qilmaydi
 */
export type ApplyMode = 'restart' | 'rebuild' | 'none';

export interface SettingDefinition {
  key: string;
  scope: SettingScope;
  type: SettingType;
  /** UI'da shu nom ostida guruhlanadi. */
  group: string;
  label: string;
  help?: string;
  /** Ko'rsatkichli standart qiymat (satr ko'rinishida — .env ham satr). */
  default?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  /** `string` turi uchun qo'shimcha shakl tekshiruvi. */
  pattern?: RegExp;
  patternHint?: string;
  applies: ApplyMode;
  /** UI'da "Qo'shimcha" bo'limi ostiga yashiriladi. */
  advanced?: boolean;
  /**
   * Bo'sh qiymatda .env ga UMUMAN yozilmaydi.
   * Bo'sh satr yozish ba'zan standartni buzadi: masalan
   * `TELEGRAM_BOT_WEBAPP_URL=` client'ga "berilgan, lekin bo'sh" bo'lib
   * ko'rinadi va env.js dagi fallback ishlamay qoladi.
   */
  omitWhenEmpty?: boolean;
}

export const SETTING_GROUPS = [
  'Umumiy',
  'Telegram bot',
  'AI (Gemini)',
  'Fayl saqlash',
  'Xavfsizlik',
  'Vaqt mintaqasi',
] as const;

export const SETTINGS: SettingDefinition[] = [
  // ─────────────────────────────────────────────────────── Umumiy
  {
    key: 'MULTI_BRANCH',
    scope: 'server',
    type: 'boolean',
    group: 'Umumiy',
    label: "Ko'p filialli rejim",
    help:
      "Yoqilgan: filial tanlagichi, \"Filiallar\" bo'limi va jadval ustuni ko'rinadi. " +
      "O'chirilgan: yakka o'quv markazi — filial tushunchasi UI'dan butunlay yo'qoladi.",
    default: 'true',
    applies: 'restart',
  },

  // ─────────────────────────────────────────────────── Telegram bot
  {
    key: 'TELEGRAM_BOT_ENABLED',
    scope: 'server',
    type: 'boolean',
    group: 'Telegram bot',
    label: 'Botni yoqish',
    help: "Token kiritilmagan bo'lsa yoqib bo'lmaydi.",
    default: 'false',
    applies: 'restart',
  },
  {
    key: 'TELEGRAM_BOT_TOKEN',
    scope: 'server',
    type: 'secret',
    group: 'Telegram bot',
    label: 'Bot token',
    help: '@BotFather bergan token. Bazada shifrlangan holda saqlanadi.',
    pattern: /^\d{6,}:[\w-]{30,}$/,
    patternHint: "Format: 123456789:AA... (@BotFather bergan ko'rinishda)",
    applies: 'restart',
    omitWhenEmpty: true,
  },
  {
    key: 'TELEGRAM_BOT_TOKEN_2',
    scope: 'server',
    type: 'secret',
    group: 'Telegram bot',
    label: "Ikkinchi bot token",
    help: "Ixtiyoriy — o'quvchilar va xodimlar uchun alohida bot ishlatilsa.",
    pattern: /^\d{6,}:[\w-]{30,}$/,
    patternHint: 'Format: 123456789:AA...',
    applies: 'restart',
    advanced: true,
    omitWhenEmpty: true,
  },
  {
    key: 'TELEGRAM_BOT_WEBAPP_URL',
    scope: 'server',
    type: 'string',
    group: 'Telegram bot',
    label: 'WebApp manzili',
    help:
      "Bo'sh qoldiring — tenant domeni asosida avtomatik hosil qilinadi " +
      '(https://domen/bot-auth). Telegram HTTPS talab qiladi.',
    pattern: /^https:\/\/\S+$/,
    patternHint: 'HTTPS manzil bo\'lishi shart',
    applies: 'restart',
    advanced: true,
    omitWhenEmpty: true,
  },

  // ────────────────────────────────────────────────────── AI (Gemini)
  {
    key: 'GEMINI_API_KEY',
    scope: 'server',
    type: 'secret',
    group: 'AI (Gemini)',
    label: 'Gemini API kalit',
    help:
      "Bo'sh bo'lsa AI qatlami o'chmaydi — izohlar deterministik shablon " +
      'matnda yoziladi. Kalit qo\'yilsa jonli AI izohlar yoqiladi.',
    applies: 'restart',
    omitWhenEmpty: true,
  },
  {
    key: 'GEMINI_MODEL',
    scope: 'server',
    type: 'select',
    group: 'AI (Gemini)',
    label: 'Model',
    default: 'gemini-2.5-flash',
    options: [
      { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (arzon, tez)' },
      { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro (kuchli, qimmat)' },
      { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (eski)' },
    ],
    applies: 'restart',
  },
  {
    key: 'AI_MONTHLY_CALL_CAP',
    scope: 'server',
    type: 'number',
    group: 'AI (Gemini)',
    label: 'Oylik AI chaqiruv chegarasi',
    help:
      'Tannarx tormozi. Amaldagi chegara — shu qiymat bilan tarifdagi ' +
      "ai_calls_month ning KICHIGI. 4000 ≈ $1.9/oy (gemini-2.5-flash).",
    default: '4000',
    min: 0,
    max: 1_000_000,
    applies: 'restart',
  },

  // ─────────────────────────────────────────────────── Fayl saqlash
  {
    key: 'STORAGE_QUOTA_GB',
    scope: 'server',
    type: 'number',
    group: 'Fayl saqlash',
    label: 'Umumiy disk chegarasi (GB)',
    help:
      "Markazning barcha biriktirmalari uchun. To'lgach yangi fayl qabul " +
      'qilinmaydi — vazifa faqat matn sifatida yuboriladi.',
    default: '5',
    min: 1,
    max: 500,
    applies: 'restart',
  },
  {
    key: 'MAX_UPLOAD_MB',
    scope: 'server',
    type: 'number',
    group: 'Fayl saqlash',
    label: 'Bitta fayl chegarasi (MB)',
    help:
      "Telegram hujjat chegarasi 50 MB — undan katta qilish ma'nosiz: " +
      'fayl yuklanardi-yu, botga bermay qolardi.',
    default: '5',
    min: 1,
    max: 50,
    applies: 'restart',
  },
  {
    key: 'UPLOAD_DIR',
    scope: 'server',
    type: 'string',
    group: 'Fayl saqlash',
    label: 'Fayllar papkasi',
    help:
      'Server jarayoni ishlaydigan papkaga nisbatan. Deployda bu papka ' +
      "saqlanib qolishi shart — aks holda qayta qurishda biriktirmalar yo'qoladi.",
    default: 'uploads',
    pattern: /^[\w./-]+$/,
    patternHint: "Faqat harf, raqam, '.', '/', '-', '_'",
    applies: 'restart',
    advanced: true,
  },

  // ───────────────────────────────────────────────────── Xavfsizlik
  {
    key: 'JWT_ACCESS_TTL',
    scope: 'server',
    type: 'string',
    group: 'Xavfsizlik',
    label: 'Access token muddati',
    help: "Masalan 15m, 1h. Qisqa muddat xavfsizroq, lekin serverga yuk ko'proq.",
    default: '15m',
    pattern: /^\d+[smhd]$/,
    patternHint: "Format: 15m, 2h, 7d",
    applies: 'restart',
    advanced: true,
  },
  {
    key: 'JWT_REFRESH_TTL',
    scope: 'server',
    type: 'string',
    group: 'Xavfsizlik',
    label: 'Refresh token muddati',
    help: 'Foydalanuvchi shu muddat davomida qayta login qilmaydi.',
    default: '7d',
    pattern: /^\d+[smhd]$/,
    patternHint: 'Format: 7d, 30d',
    applies: 'restart',
    advanced: true,
  },
  {
    key: 'ENFORCE_LIMITS',
    scope: 'server',
    type: 'boolean',
    group: 'Xavfsizlik',
    label: 'Tarif limitlarini majburlash',
    help:
      "Yoqilgan: limit oshganda yangi yozuv yaratish bloklanadi. " +
      "O'chirilgan: faqat ogohlantirish ko'rsatiladi.",
    default: 'true',
    applies: 'restart',
  },

  // ────────────────────────────────────────────── Vaqt mintaqasi
  {
    key: 'TZ_NAME',
    scope: 'server',
    type: 'string',
    group: 'Vaqt mintaqasi',
    label: 'Vaqt mintaqasi',
    help: "Rejalashtirilgan vazifalar va bildirishnomalar shu mintaqada ishlaydi.",
    default: 'Asia/Tashkent',
    pattern: /^[A-Za-z]+\/[A-Za-z_]+$/,
    patternHint: 'Masalan: Asia/Tashkent, Europe/Moscow',
    applies: 'restart',
  },
  {
    key: 'TZ_OFFSET_MIN',
    scope: 'server',
    type: 'number',
    group: 'Vaqt mintaqasi',
    label: "UTC dan farq (daqiqa)",
    help:
      "Davomat kunini hisoblashda ishlatiladi. O'zbekiston = 300 (UTC+5). " +
      "Yuqoridagi mintaqa bilan MOS bo'lishi kerak.",
    default: '300',
    min: -720,
    max: 840,
    applies: 'restart',
    advanced: true,
  },
];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

export function getSetting(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key);
}

export function isKnownSetting(key: string): boolean {
  return BY_KEY.has(key);
}

/** Kalit maxfiymi — shifrlash va niqoblash qarori shundan. */
export function isSecretSetting(key: string): boolean {
  return BY_KEY.get(key)?.type === 'secret';
}

export interface ValidationResult {
  ok: boolean;
  /** Normallashtirilgan qiymat (trim, boolean → "true"/"false"). */
  value: string;
  error?: string;
}

/**
 * Qiymatni turiga qarab tekshiradi va normallashtiradi.
 *
 * Bo'sh qiymat HAR DOIM yaroqli — bu "standartga qaytar" degani.
 * Shuning uchun `min` chegarasi bo'sh satrga qo'llanmaydi.
 */
export function validateSettingValue(
  def: SettingDefinition,
  raw: unknown,
): ValidationResult {
  const value = String(raw ?? '').trim();

  if (value === '') return { ok: true, value: '' };

  switch (def.type) {
    case 'boolean': {
      const v = value.toLowerCase();
      if (!['true', 'false'].includes(v)) {
        return { ok: false, value, error: `${def.label}: true yoki false bo'lishi kerak` };
      }
      return { ok: true, value: v };
    }

    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return { ok: false, value, error: `${def.label}: son bo'lishi kerak` };
      }
      if (def.min !== undefined && n < def.min) {
        return { ok: false, value, error: `${def.label}: eng kami ${def.min}` };
      }
      if (def.max !== undefined && n > def.max) {
        return { ok: false, value, error: `${def.label}: eng ko'pi ${def.max}` };
      }
      return { ok: true, value: String(n) };
    }

    case 'select': {
      const allowed = (def.options || []).map((o) => o.value);
      if (!allowed.includes(value)) {
        return {
          ok: false,
          value,
          error: `${def.label}: faqat quyidagilardan biri — ${allowed.join(', ')}`,
        };
      }
      return { ok: true, value };
    }

    case 'secret':
    case 'string': {
      if (def.pattern && !def.pattern.test(value)) {
        return {
          ok: false,
          value,
          error: `${def.label}: ${def.patternHint || "format noto'g'ri"}`,
        };
      }
      // .env qatori bitta satr — yangi qator qiymatni buzadi
      if (/[\r\n]/.test(value)) {
        return { ok: false, value, error: `${def.label}: yangi qator belgisi bo'lmasin` };
      }
      return { ok: true, value };
    }

    default:
      return { ok: true, value };
  }
}

/**
 * Bir nechta o'zgarish uchun eng "og'ir" qo'llash rejimini tanlaydi.
 * rebuild > restart > none — client qayta qurilsa, server ham qayta ishga tushadi.
 */
export function heaviestApplyMode(modes: ApplyMode[]): ApplyMode {
  if (modes.includes('rebuild')) return 'rebuild';
  if (modes.includes('restart')) return 'restart';
  return 'none';
}
