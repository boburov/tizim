/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIT YOZUVI UCHUN YORDAMCHILAR — tanani tozalash, resursni ajratish.
 *
 * `server_legacy/src/helpers/auditLog.helper.js` NING KO'CHIRMASI
 * (o'chirilgan commit: `47ae5e3`).
 *
 * ⚠ BITTA XATO ATAYLAB TUZATILDI — `SENSITIVE_KEYS` ANIQ MOSLIK edi.
 *
 * Eski ro'yxatda `password` bor edi, lekin `currentPassword` va
 * `newPassword` YO'Q edi — ular kichik harfga o'tkazilganda ham
 * `currentpassword`/`newpassword` bo'lib, to'plamga TUSHMASDI.
 * Aynan shu ikkitasi `POST /auth/change-password` tanasining maydon
 * nomlari, ya'ni parol o'zgartirilgan har bir so'rov OCHIQ MATNDA
 * `activity_logs.body` ga yozilardi.
 *
 * Shuning uchun endi QISM SATR bo'yicha moslik: kalit ichida
 * `password`/`token`/`secret`... uchrasa — REDACTED.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Kalit ichida shu bo'laklardan biri uchrasa — yashiriladi. */
const SENSITIVE_PATTERNS: readonly string[] = Object.freeze([
  'password',
  'passwordhash',
  'token',
  'secret',
  'credential',
  'apikey',
  'initdata',
  'pin',
  'cvv',
  'otp',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 5;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Kalit maxfiymi — QISM SATR bo'yicha (aniq moslik EMAS). */
export const isSensitiveKey = (key: string): boolean => {
  const k = String(key).toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => k.includes(p));
};

export const sanitize = (input: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]';
  if (Array.isArray(input)) return input.map((it) => sanitize(it, depth + 1));
  if (!isPlainObject(input)) return input;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (isSensitiveKey(k)) out[k] = REDACTED;
    else if (isPlainObject(v) || Array.isArray(v)) out[k] = sanitize(v, depth + 1);
    else out[k] = v;
  }
  return out;
};

/** `/api/users/abc…` → `{ type: 'user', id: 'abc…' }` */
const RESOURCE_MAP: Record<string, string> = {
  users: 'user',
  groups: 'group',
  feedback: 'feedback',
  holidays: 'holiday',
  notifications: 'notification',
  'notification-templates': 'notificationTemplate',
  'feedback-types': 'feedbackType',
  attendance: 'attendance',
  'attendance-exemptions': 'attendanceExemption',
  'attendance-settings': 'attendanceSettings',
  'activity-logs': 'activityLog',
  'admin-dashboard': 'adminDashboard',
  auth: 'auth',
  'bot-auth': 'botAuth',
};

/**
 * ⚠ 24 BELGILI HEX — Mongo davridan qolgan ID shakli. Postgres'ga
 * ko'chishda `gen_object_id()` bilan SAQLANGAN, shuning uchun bu
 * tekshiruv hamon to'g'ri ishlaydi.
 */
const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;

export const extractResource = (originalUrl: string): { type: string; id: string } => {
  if (!originalUrl) return { type: '', id: '' };
  const path = String(originalUrl).split('?')[0];
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();
  if (!parts.length) return { type: '', id: '' };

  const type = RESOURCE_MAP[parts[0]] || parts[0];
  let id = '';
  for (let i = 1; i < parts.length; i += 1) {
    if (OBJECT_ID_REGEX.test(parts[i])) { id = parts[i]; break; }
  }
  return { type, id };
};

/** Katta tanani saqlamaymiz — jadval shishib ketmasin. */
export const truncateBody = (body: unknown, maxBytes = 10240): unknown => {
  if (body == null) return null;
  try {
    const str = JSON.stringify(body);
    if (str.length > maxBytes) return { truncated: true, size: str.length };
    return body;
  } catch {
    return { truncated: true, size: 0 };
  }
};
