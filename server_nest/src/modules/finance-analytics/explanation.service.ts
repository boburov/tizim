import crypto from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * IZOH QATLAMI — LLM IXTIYORIY, MAJBURIY EMAS
 * (`services/explanation.service.js` EKVIVALENTI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── UCH BOSQICHLI ZAXIRA ──
 *   1. keshdagi izoh          (arzon, tez)
 *   2. LLM izohi              (agar sozlangan va byudjet ochiq bo'lsa)
 *   3. DETERMINISTIK matn     (har doim ishlaydi)
 *
 * Uchinchisi ENG MUHIMI: LLM o'chirilgan, kaliti yo'q yoki limiti
 * tugagan bo'lsa ham foydalanuvchi to'liq tushunarli izoh oladi.
 * "AI ishlamayapti" degan bo'sh ekran bo'lmaydi.
 *
 * ── LLM RAQAM O'ZGARTIRA OLMAYDI ──
 * Javob faqat MATN sifatida saqlanadi. Barcha raqamlar signalning
 * o'zida (`evidence[]`) qoladi va UI ularni AYNAN o'sha yerdan
 * ko'rsatadi. Ya'ni model raqamni noto'g'ri takrorlasa ham,
 * ekrandagi son o'zgarmaydi.
 *
 * ══════════════════════════════════════════════════════════════════════
 * ⚠⚠ KO'CHIRISHDA BLOKLANGAN QISM: `ai` MODULI (B29) ⚠⚠
 *
 * Express'dagi 2-bosqich `modules/ai/services/gemini.service.js`
 * (`generateFinanceExplanation`, `isNarrationConfigured`) va
 * `aiBudget.service.js` (`openBudget`) ga tayanadi. Bu modul NestJS'ga
 * HALI KO'CHIRILMAGAN va u MENING KO'LAMIMDA EMAS.
 *
 * ── NEGA MANTIQ NUSXA KO'CHIRILMADI ──
 * `gemini.service.js` faqat "so'rov yuborish" emas: unda timeout,
 * abort, token hisobi, `AiUsage` yozuvi va kesh barmoq izi bor.
 * Ularni bu yerda qayta yozish IKKINCHI AI qatlami bo'lardi va
 * oylik limit ikki joyda alohida sanalardi — ya'ni limit ishlamay
 * qolardi.
 *
 * ── HOZIR NIMA BO'LADI ──
 * `narrationPort` ULANMAGAN (`null`), shuning uchun:
 *   • KESHDAGI izoh Express bilan AYNAN bir xil qaytadi (`ai_cached`)
 *   • kesh bo'sh bo'lsa DETERMINISTIK matn qaytadi
 *
 * Ya'ni `?explain=true` va kesh bo'sh bo'lgan holatda NestJS Express'dan
 * FARQ QILADI (`source: "deterministic"` va `"ai"`). Bu holat paritet
 * testida O'TKAZIB YUBORILMAYDI — u OCHIQ belgilangan va hisobotda
 * "bloklangan" deb sanaladi. `ai` moduli ko'chirilgach, bu yerga
 * faqat `narrationPort` ulanadi — qolgan mantiq tayyor.
 * ══════════════════════════════════════════════════════════════════════
 */

// Kesh muddati: moliyaviy davr ichida faktlar o'zgarmaydi, lekin
// yangi to'lov kelsa raqamlar siljiydi — 6 soat oraliq shu ikkisi
// o'rtasidagi murosa.
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * AI QATLAMIGA ULANISH NUQTASI.
 *
 * `ai` moduli ko'chirilgach shu interfeys implementatsiyasi beriladi.
 * Interfeys ATAYLAB tor: izoh qatlami LLM haqida faqat shuncha narsani
 * bilishi kerak.
 */
export interface FinanceNarrationPort {
  isConfigured(): boolean;
  /** Byudjet yopiq bo'lsa `false` — LLM chaqirilmaydi. */
  canSpend(): Promise<boolean>;
  spend(n: number): void;
  generate(signal: Record<string, unknown>): Promise<string | null>;
}

/**
 * KESH KALITI FAKTLARDAN quriladi, signal ID sidan emas.
 *
 * Sabab: bir xil ID li signal ertasi kuni BOSHQA raqamlarga ega
 * bo'ladi. ID bo'yicha keshlansa, eski izoh yangi raqamlar ustida
 * ko'rsatilib, ular bir-biriga zid bo'lardi.
 */
export const cacheKey = (signal: Record<string, any>): string => {
  const facts = JSON.stringify({
    t: signal.type,
    e: signal.entityId || null,
    v: signal.currentValue,
    p: signal.previousValue,
    ev: (signal.evidence || []).map((x: any) => [x.label, x.current, x.previous]),
  });
  return `fin-explain:${crypto.createHash('sha1').update(facts).digest('hex').slice(0, 32)}`;
};

/**
 * DETERMINISTIK IZOH — LLM'siz ham to'liq ma'noli.
 *
 * Bu ZAXIRA EMAS, ASOS: u har doim mavjud va LLM faqat uni
 * yaxshilaydi.
 */
export const deterministicExplanation = (signal: Record<string, any>): string => {
  const fmt = (v: unknown, unit?: string): string => {
    if (v === null || v === undefined) return '—';
    if (unit === '%') return `${v}%`;
    if (unit === 'ta' || unit === 'soat') return `${v} ${unit}`;
    return `${new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v)))} so'm`;
  };
  const lines = (signal.evidence || []).slice(0, 4).map((e: any) => {
    const base = `${e.label}: ${fmt(e.current, e.unit)}`;
    if (e.previous === null || e.previous === undefined) return base;
    const chg =
      e.changePercent !== null && e.changePercent !== undefined
        ? ` (${e.changePercent > 0 ? '+' : ''}${e.changePercent}%)`
        : '';
    return `${base}, oldingi davrda ${fmt(e.previous, e.unit)}${chg}`;
  });
  return `${signal.title}. ${lines.join('. ')}.`;
};

@Injectable()
export class ExplanationService {
  private readonly logger = new Logger('FinanceExplanation');

  /**
   * ⚠ HOZIRCHA `null` — yuqoridagi B29 izohiga qarang. Bu maydon
   * `ai` moduli ko'chirilgandan keyin to'ldiriladi.
   */
  private readonly narrationPort: FinanceNarrationPort | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Signal uchun izoh. */
  async explainSignal(
    signal: Record<string, any>,
    { useAi = true }: { useAi?: boolean } = {},
  ) {
    const fallback = deterministicExplanation(signal);
    const base = {
      text: fallback,
      source: 'deterministic',
      // Raqamlar HAR DOIM signalning o'zidan — matndan emas.
      evidence: signal.evidence || [],
    };

    if (!useAi) return base;

    // ── KESH: `ai` ULANMAGAN BO'LSA HAM O'QILADI ──
    // Express yozib qo'ygan izoh AYNAN o'sha kalit bilan topiladi, ya'ni
    // keshga tushgan holatda ikkala stack bir xil matn qaytaradi.
    const key = cacheKey(signal);
    try {
      const cached = await this.prisma.cache.findUnique({ where: { key } });
      const value = cached?.value as { text?: string } | null;
      if (cached && cached.expiresAt > new Date() && value?.text) {
        return { ...base, text: value.text, source: 'ai_cached' };
      }
    } catch {
      /* kesh o'qilmasa — davom etamiz */
    }

    if (!this.narrationPort || !this.narrationPort.isConfigured()) return base;

    // AI BYUDJETI (oylik chaqiruv limiti).
    //
    // NEGA MUHIM: izoh foydalanuvchi bosganda so'raladi, ya'ni chaqiruv
    // soni foydalanuvchi xatti-harakatiga bog'liq. Limitsiz bu oyning
    // o'rtasida kutilmagan hisobga aylanardi.
    try {
      if (!(await this.narrationPort.canSpend())) {
        return { ...base, source: 'deterministic', note: 'AI oylik limiti tugagan' };
      }
    } catch {
      /* byudjet o'qilmasa — LLM ni bloklamaymiz */
    }

    const text = await this.narrationPort.generate(signal);
    if (!text) return base;
    // Faqat MUVAFFAQIYATLI chaqiruv sanaladi.
    try {
      this.narrationPort.spend(1);
    } catch {
      /* e'tiborsiz */
    }

    try {
      await this.prisma.cache.upsert({
        where: { key },
        create: {
          key,
          value: { text, signalId: signal.id },
          expiresAt: new Date(Date.now() + TTL_MS),
        },
        update: {
          value: { text, signalId: signal.id },
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      });
    } catch (err) {
      this.logger.warn(`Moliyaviy izohni keshlab bo'lmadi: ${(err as Error)?.message}`);
    }

    return { ...base, text, source: 'ai' };
  }
}
