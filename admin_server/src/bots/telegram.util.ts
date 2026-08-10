/**
 * Telegram Bot API bilan gaplashadigan yupqa qatlam.
 *
 * Faqat panelga kerak bo'lgan uchta narsa uchun: tokenni tekshirish,
 * webhook holatini ko'rsatish va uni tozalash. Deploy paytidagi
 * setWebhook/deleteWebhook esa SKRIPT ichida bajariladi — u yerda bot allaqachon
 * o'z serverida turadi va natija deploy logiga tushishi kerak.
 */

const API = 'https://api.telegram.org';
/** Telegram javob bermasa panel muzlab qolmasligi kerak. */
const TIMEOUT_MS = 8000;

export interface TelegramMe {
  id: number;
  username: string | null;
  firstName: string | null;
}

export interface WebhookInfo {
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorMessage: string | null;
  lastErrorDate: number | null;
}

/** Telegram xatosi — chaqiruvchi uni 400 ga aylantiradi. */
export class TelegramError extends Error {}

async function call<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
  } catch (err: any) {
    // Tarmoq uzilishi va token xatosi FARQLI holatlar: birinchisida
    // foydalanuvchi keyinroq qayta urinishi kerak, ikkinchisida tokenni
    // almashtirishi. Xabar shuni ajratib aytadi.
    throw new TelegramError(
      err?.name === 'AbortError'
        ? "Telegram javob bermadi (timeout). Keyinroq urinib ko'ring."
        : `Telegram'ga ulanib bo'lmadi: ${err?.message || err}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new TelegramError(
      data?.description || `Telegram xatosi (HTTP ${res.status})`,
    );
  }
  return data.result as T;
}

/** Token haqiqiyligini tekshiradi va bot ma'lumotini qaytaradi. */
export async function getMe(token: string): Promise<TelegramMe> {
  const r = await call<any>(token, 'getMe');
  return {
    id: r.id,
    username: r.username ?? null,
    firstName: r.first_name ?? null,
  };
}

export async function getWebhookInfo(token: string): Promise<WebhookInfo> {
  const r = await call<any>(token, 'getWebhookInfo');
  return {
    url: r.url || '',
    hasCustomCertificate: Boolean(r.has_custom_certificate),
    pendingUpdateCount: r.pending_update_count ?? 0,
    lastErrorMessage: r.last_error_message ?? null,
    lastErrorDate: r.last_error_date ?? null,
  };
}

/**
 * Webhook'ni olib tashlaydi.
 *
 * `drop_pending_updates` ATAYLAB berilmaydi: to'xtatilgan bot qayta ishga
 * tushganda kutib turgan xabarlarni olishi kerak — ularni jimgina yo'q
 * qilish mijoz uchun yo'qolgan buyurtma degani.
 */
export async function deleteWebhook(token: string): Promise<void> {
  await call(token, 'deleteWebhook');
}
