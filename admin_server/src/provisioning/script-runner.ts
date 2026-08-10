/**
 * VPS skriptlarini chaqirish uchun umumiy yordamchilar.
 *
 * Tenant provisioningi ham, bot deploy'i ham bir xil naqshda ishlaydi:
 * skriptga ENV orqali ma'lumot beriladi, butun chiqishi yig'iladi va
 * natijaga qarab DB'dagi holat yangilanadi. Shu uch funksiya ikkalasida
 * ham aynan bir xil bo'lgani uchun alohida faylga chiqarilgan — nusxa
 * ko'chirilsa, bittasidagi tuzatish ikkinchisiga yetib bormasdi.
 */
import { spawn } from 'node:child_process';

/** Bazaga va javobga yoziladigan log uzunligi chegarasi. */
export const LOG_LIMIT = 60000;

/**
 * Skriptga uzatiladigan fayl mazmuni — base64.
 *
 * NEGA: `.env` ichida qo'shtirnoq, `$`, yangi qator va boshqa bash uchun
 * maxsus belgilar bo'ladi. Ularni ENV orqali xom holda yuborish qochirish
 * (escaping) muammosiga olib keladi; base64 esa bir xil ishlaydi.
 */
export function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** Logning oxirgi qismi — uzun chiqish bazani shishirmasligi uchun. */
export function tailLog(log: string, limit = LOG_LIMIT): string {
  return log.length > limit ? log.slice(-limit) : log;
}

/**
 * Skriptni ishga tushiradi va butun chiqishini yig'ib qaytaradi.
 *
 * Hech qachon reject qilmaydi: skriptni umuman ishga tushirib bo'lmasa ham
 * `code: -1` bilan tushunarli xabar qaytadi. Sabab — chaqiruvchi har doim
 * DB'dagi holatni yangilashi kerak, aks holda tenant/bot abadiy
 * "PROVISIONING" holatida qolib ketardi.
 */
export function runScript(
  scriptPath: string,
  env: Record<string, string>,
  cwd = process.env.PROVISION_CWD || '/root/admin',
): Promise<{ code: number | null; log: string }> {
  return new Promise((resolve) => {
    const child = spawn('bash', [scriptPath], {
      env: { ...process.env, ...env },
      cwd,
    });

    let log = '';
    const append = (chunk: Buffer) => {
      log += chunk.toString();
      if (log.length > LOG_LIMIT) log = log.slice(-LOG_LIMIT);
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);

    child.on('close', (code) => resolve({ code, log }));
    child.on('error', (err) =>
      resolve({
        code: -1,
        log: `${log}\n❌ Skriptni ishga tushirib bo'lmadi: ${err.message}`,
      }),
    );
  });
}
