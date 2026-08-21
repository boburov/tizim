import { Injectable } from '@nestjs/common';
import { NarrationQueueService } from '../../modules/ai/narration-queue.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * `hourly.ai-narration` — `server/src/jobs/aiNarration.job.js` KO'CHIRMASI.
 *
 * Shablon matnni Gemini matniga ASTA-SEKIN almashtiradi.
 *
 * ── ⚠ NEGA SOATLIK VA NEGA QAYTA HISOBLASHGA BOG'LANMAGAN ──
 * Qayta hisoblash oxiriga ulansa, 400 ta insight BIR ZUMDA navbatga
 * tushardi va bepul daraja limitiga urilib, ko'pchiligi MATNSIZ
 * qolardi. Soatlik yurish yuklamani kunga TEKIS yoyadi — ertalabki
 * 08:00 da eng muhim insight'lar (priority bo'yicha) tayyor bo'ladi.
 *
 * ── ⚠ 25-DAQIQA ──
 * Boshqa joblar soatning 0/5/10/20-daqiqalarida turadi — ular bilan
 * bir vaqtda ishlamasin.
 *
 * ⚠ Kalit yo'q bo'lsa job HECH NARSA QILMAYDI va jimgina chiqadi —
 * narrator IXTIYORIY, uning yo'qligi xato emas.
 */
@Injectable()
export class AiNarrationJob implements JobDefinition {
  readonly name = 'hourly.ai-narration';
  /** Express: `every("25 * * * *", AI_NARRATION_JOB)`. */
  readonly cron = '25 * * * *';

  constructor(private readonly queue: NarrationQueueService) {}

  async run(): Promise<void> {
    // ⚠ `...Logged` — jurnalga yozish job'da EMAS, servisda: Express'da
    // ham aynan shunday va sarf statistikasi bitta joydan chiqadi.
    await this.queue.runNarrationQueueLogged();
  }
}
