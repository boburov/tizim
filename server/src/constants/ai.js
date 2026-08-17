/**
 * AI DVIGATELI VERSIYASI.
 *
 * Ilgari bu qiymat `models/aiConfig.model.js` ichida edi va Mongoose
 * sxemasining `default` i bo'lib xizmat qilardi. Model fayllari
 * ko'chirish tugagach o'chiriladi, versiya esa TO'RTTA servisga kerak
 * (`recompute`, `report`, `insightWriter`, `aiConfig`) - shuning uchun
 * konstantaga chiqarildi.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA HAR YOZUVGA YOZILADI
 *
 * `AiRun`, `AiReport` va `Insight` yozuvlariga dvigatel versiyasi
 * MUHRLANADI. Sabab: formulalar o'zgarganda eski yozuvlar QAYTA
 * HISOBLANMAYDI (hisobot - o'sha kundagi surat). Versiyasiz keyin
 * "bu son qaysi mantiq bilan chiqqan?" degan savolga javob bo'lmasdi.
 *
 * Formulani o'zgartirgan odam bu raqamni ham oshirishi kerak.
 * ═══════════════════════════════════════════════════════════════════
 */
export const AI_ENGINE_VERSION = "1.0.0";

export default AI_ENGINE_VERSION;
