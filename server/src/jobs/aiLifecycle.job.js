import logger from "../config/logger.js";
import { runLifecycle } from "../modules/ai/services/lifecycle.service.js";

export const JOB_NAME = "daily.ai-lifecycle";

// INSIGHT HAYOT SIKLI - "bajarilganlarni avtomatik arxivlash" talabi.
//
// Uchta ish: muddati o'tganlarni yopish, yopilgan bashoratlarning
// NATIJASINI aniqlash (yopiq halqa), juda eskilarini o'chirish.
//
// VAQTI: qayta hisoblashdan (01:00) OLDIN, 00:40 da. Sabab: eskirgan
// insight avval yopilishi kerak, shundan keyingina yangi hisoblash
// "bu subyekt hali ham xavfli" degan qarorni toza holatda qabul qiladi.
// Teskari tartibda yangi yaratilgan insight darhol "muddati o'tgan"
// deb yopilib qolishi mumkin edi.
//
// Filial konteksti KERAK EMAS: bu texnik tozalash, biznes tahlili emas -
// barcha filiallar yozuvlari bir xil qoida bo'yicha ishlanadi.
export default function defineAiLifecycle(agenda) {
  agenda.define(JOB_NAME, async () => {
    const startedAt = Date.now();
    const result = await runLifecycle();
    logger.info({ ...result, ms: Date.now() - startedAt }, "AI hayot sikli tayyor");
  });
}
