import { runNarrationQueueLogged } from "../modules/ai/services/narrationQueue.service.js";

export const JOB_NAME = "hourly.ai-narration";

// AI NARRATOR - shablon matnni Gemini matniga asta-sekin almashtiradi.
//
// SOATIGA BIR MARTA, tungi qayta hisoblashga BOG'LANMAGAN holda.
//
// Nega bog'lanmagan: agar u qayta hisoblash oxirida chaqirilsa, 400 ta
// insight bir zumda navbatga tushardi va bepul daraja limitiga urilib,
// ko'pchiligi matnsiz qolardi. Soatlik yurish esa kun davomida
// yuklamani tekis taqsimlaydi - ertalabki 08:00 da eng muhim
// insight'lar (priority bo'yicha saralanadi) allaqachon tayyor bo'ladi.
//
// Kalit yo'q bo'lsa job HECH NARSA QILMAYDI va jimgina chiqadi -
// narrator ixtiyoriy, uning yo'qligi xato emas.
export default function defineAiNarration(agenda) {
  agenda.define(JOB_NAME, async () => {
    await runNarrationQueueLogged();
  });
}
