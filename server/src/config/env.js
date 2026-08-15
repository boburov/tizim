import "dotenv/config";
import path from "node:path";

// Required env var; throws on boot if missing
const need = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`ENV o'zgaruvchisi yo'q: ${key}`);
  return v;
};

// Musbat son; bo'sh, nol yoki buzuq qiymatda standartga qaytadi.
// Number("") = 0 bo'lgani uchun oddiy `|| fallback` yetarli emas:
// STORAGE_QUOTA_GB=0 yozib qo'yilsa kvota nolga tushib, HAR QANDAY fayl
// rad etilardi - bu sozlama xatosi uchun juda qattiq jazо.
const positiveNumber = (raw, fallback) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Vergul bilan ajratilgan domenlar ro'yxati -> tozalangan massiv
const parseOrigins = (raw) =>
  String(raw || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const clientUrls = parseOrigins(process.env.CLIENT_URL);
const allowAllOrigins = clientUrls.includes("*");
const realUrls = clientUrls.filter((u) => u !== "*");
const primaryUrl = realUrls[0] || "http://localhost:5173";

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 5000),

  // BREND NOMI - server tomonidagi YAGONA manba.
  //
  // Bot matnlari, bildirishnomadagi {markaz} tokeni va Excel fayllarining
  // muallif maydoni shu qiymatdan oladi. Client tomonda ayni shu nom
  // VITE_APP_NAME'da turadi; admin panel tenant provisioning paytida
  // ikkalasini ham `tenant.name` dan yozadi (admin_server settings.service).
  //
  // Standart "Bayyina" - eski o'rnatmalar upgrade'dan keyin nomini
  // yo'qotmasligi uchun (client/shared/constants/app.js bilan bir xil).
  APP_NAME: (process.env.APP_NAME || "").trim() || "Bayyina",

  DATABASE_URL: need("DATABASE_URL"),

  JWT_ACCESS_SECRET: need("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: need("JWT_REFRESH_SECRET"),
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || "15m",
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || "7d",

  COOKIE_SECRET: need("COOKIE_SECRET"),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || "localhost",

  CLIENT_URL: primaryUrl,
  CLIENT_URLS: realUrls,
  ALLOW_ALL_ORIGINS: allowAllOrigins,

  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_BOT_TOKEN_2: process.env.TELEGRAM_BOT_TOKEN_2 || "",
  TELEGRAM_BOT_ENABLED:
    String(process.env.TELEGRAM_BOT_ENABLED || "false").toLowerCase() === "true",
  TELEGRAM_BOT_WEBAPP_URL:
    process.env.TELEGRAM_BOT_WEBAPP_URL || `${primaryUrl}/bot-auth`,

  // --- Admin panel bilan aloqa (usage heartbeat) ---
  // Bo'sh bo'lsa heartbeat butunlay o'chiq bo'ladi (lokal dev, standalone rejim).
  ADMIN_API_URL: process.env.ADMIN_API_URL || "",
  TENANT_ID: process.env.TENANT_ID || "",
  HEARTBEAT_SECRET: process.env.HEARTBEAT_SECRET || "",
  // Limit oshganda yaratishni bloklash (hard limit). false = faqat ogohlantirish.
  ENFORCE_LIMITS:
    String(process.env.ENFORCE_LIMITS || "true").toLowerCase() === "true",

  // KO'P FILIALLI REJIM.
  //
  // false = yakka o'quv markazi: filial tushunchasi UI'da umuman ko'rinmaydi
  // (tanlagich, "Filiallar" bo'limi, jadval ustuni, forma maydoni) va yangi
  // filial ochib bo'lmaydi.
  //
  // Standart TRUE - ataylab. Bu o'zgaruvchi eski o'rnatmalarda yo'q, va
  // standart false bo'lsa bir nechta filiali bor markaz upgrade'dan keyin
  // filial UI'sini jimgina yo'qotardi. Yakka markaz buni ochiq e'lon qiladi.
  MULTI_BRANCH:
    String(process.env.MULTI_BRANCH || "true").toLowerCase() === "true",

  // --- AI NARRATOR (Gemini) ---
  //
  // Bo'sh bo'lsa narrator BUTUNLAY o'chiq: tizim deterministik shablon
  // matnda ishlaydi va hech narsa buzilmaydi. `need()` ATAYLAB
  // ishlatilmadi - kalitsiz server ishga tushmay qolsa, ixtiyoriy
  // yaxshilanish majburiy bog'liqlikka aylanardi.
  //
  // Gemini bepul darajasi (free tier) shu maqsad uchun yetarli: narrator
  // faqat YANGI yoki faktorlari O'ZGARGAN insight uchun chaqiriladi
  // (narrationHash keshi), ya'ni kuniga o'nlab so'rov, minglab emas.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",

  // Oylik LLM chaqiruvlarining MAHALLIY yuqori chegarasi.
  //
  // Tarif chegarasi (ai_calls_month) admin serverdan keladi, lekin unga
  // YAKKA O'ZIGA tayanib bo'lmaydi: heartbeat yetib kelmasa entitlements
  // qatlami limitni "cheksiz" deb hisoblaydi (mijozni bloklamaslik uchun
  // ataylab shunday). Kirish huquqi uchun bu to'g'ri, XARAJAT uchun esa
  // halokatli - bitta tarmoq uzilishi hisobni cheksiz ochib qo'yardi.
  //
  // Shuning uchun amaldagi chegara har doim ikkalasining KICHIGI.
  // 4000 ≈ $1.9/oy - eng arzon pullik tarifda ham marja musbat qoladi.
  AI_MONTHLY_CALL_CAP: Number(process.env.AI_MONTHLY_CALL_CAP || 4000),

  // --- FAYL SAQLASH (vazifa biriktirmalari) ---
  //
  // Ikkala chegara ham BAYTGA aylantiriladi: solishtirish har doim bayt
  // bilan bo'ladi, sozlama esa odam o'qiydigan birlikda (GB / MB) turadi.
  //
  // STORAGE_QUOTA_GB - butun o'quv markazining umumiy disk chegarasi.
  //   Chegara to'lgach yangi fayl UMUMAN qabul qilinmaydi (matn ketaveradi).
  // MAX_UPLOAD_MB   - BITTA fayl uchun chegara. Telegram hujjat chegarasi
  //   50 MB, shuning uchun bu qiymatni undan oshirish ma'nosiz: fayl
  //   yuklanardi-yu, botga bermay qolardi.
  STORAGE_QUOTA_BYTES: Math.round(
    positiveNumber(process.env.STORAGE_QUOTA_GB, 5) * 1024 * 1024 * 1024,
  ),
  MAX_UPLOAD_BYTES: Math.round(
    positiveNumber(process.env.MAX_UPLOAD_MB, 5) * 1024 * 1024,
  ),

  // --- REDIS (ommaviy import navbati) ---
  //
  // Bo'sh bo'lsa navbat O'CHIQ bo'ladi va ommaviy import SINXRON
  // bajariladi (qarang: config/redis.js). `need()` ATAYLAB
  // ishlatilmagan: Redis'siz o'rnatmalar (lokal dev, kichik markaz)
  // upgrade'dan keyin ishga tushmay qolmasligi kerak.
  //
  // Sinxron rejimda qatorlar soni QATTIQ cheklanadi (IMPORT_SYNC_MAX_ROWS):
  // 500 qatorli import bitta HTTP so'rovda o'n minglab DB amali qiladi va
  // proxy timeout'iga uriladi - foydalanuvchi esa import muvaffaqiyatsiz
  // deb o'ylab, faylni QAYTA yuklaydi. Aynan shu ikkinchi urinish pulni
  // ikki marta yozishga eng katta xavf edi.
  REDIS_URL: process.env.REDIS_URL || "",
  // Bir nechta markaz bitta Redis'ni bo'lishsa - kalitlar aralashmasligi uchun.
  REDIS_PREFIX: process.env.REDIS_PREFIX || process.env.TENANT_ID || "lc",
  // Navbatsiz (sinxron) rejimda bir faylda ruxsat etilgan maksimal qator.
  IMPORT_SYNC_MAX_ROWS: Math.round(
    positiveNumber(process.env.IMPORT_SYNC_MAX_ROWS, 50),
  ),
  // Bir vaqtda ishlaydigan import worker'lari. 1 - ataylab: importlar
  // bir-biriga parallel ishlasa bir xil loginni ikki qatorga berish
  // ehtimoli oshadi va DB yuki sakraydi.
  IMPORT_QUEUE_CONCURRENCY: Math.round(
    positiveNumber(process.env.IMPORT_QUEUE_CONCURRENCY, 1),
  ),

  // Fayllar diskda shu papkada saqlanadi (jarayon ishlaydigan papkaga
  // nisbatan). Docker/deploy'da bu papka VOLUME bo'lishi kerak - aks holda
  // konteyner qayta qurilganda barcha biriktirmalar yo'qoladi.
  UPLOAD_DIR: path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads"),
});

export const isProd = env.NODE_ENV === "production";

export default env;
