import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRISMA KENGAYTMALARI — `server/src/config/prisma.js` DAN AYNAN KO'CHIRILGAN
 *
 * Bu ikki kengaytma Express ilovasida ISHLAB TURIBDI va ular yo'qolsa
 * xato JIMGINA bo'ladi: kod kompilyatsiya bo'ladi, testlar o'tadi, faqat
 * natijalar noto'g'ri chiqadi. Shuning uchun ular NestJS tomonida
 * qayta yozilmadi — mantiq bir xil, faqat tili TypeScript.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * DECIMAL → SON.
 *
 * Pul ustunlari `numeric(18,2)` va Prisma ularni `Decimal` OBYEKTI qilib
 * qaytaradi. JavaScript'da bu o'ta xavfli:
 *
 *     total = a.amount + b.amount   // "700000" + "300000" = "700000300000"
 *
 * `+` operatori obyektni satrga keltiradi va xato HECH QANDAY ogohlantirish
 * bermaydi — yig'indi shunchaki bema'ni kattalashadi.
 *
 * DIQQAT: `v.constructor.name === "Decimal"` TEKSHIRUVI ISHLAMAYDI —
 * Prisma o'z ichidagi decimal.js ni minifikatsiya qiladi va sinf nomi `i`
 * ga aylanadi. Nomga tayangan tekshiruv jimgina `false` qaytarib butun
 * normalizatsiyani o'chirib qo'yadi. Shuning uchun decimal.js ning O'Z
 * statik metodi ishlatiladi.
 */
const isDecimal = (v: unknown): v is Prisma.Decimal => {
  if (v === null || typeof v !== 'object') return false;
  if (Prisma.Decimal.isDecimal(v)) return true;
  // Zaxira: xom SQL natijasi boshqa decimal.js nusxasidan kelishi mumkin.
  const c = v as Record<string, unknown>;
  return (
    typeof c.toNumber === 'function' &&
    typeof c.toFixed === 'function' &&
    typeof c.isNaN === 'function' &&
    Array.isArray((c as { d?: unknown }).d)
  );
};

const normalizeDecimals = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (isDecimal(value)) return value.toNumber();
  // Date/Buffer kabi sinf nusxalariga KIRMAYMIZ — ularni qayta qurish
  // buzadi (sana bo'sh obyektga aylanib, JSON'da `{}` bo'lib chiqardi).
  if (Array.isArray(value)) return value.map(normalizeDecimals);
  if (typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = normalizeDecimals(v);
  }
  return out;
};

/**
 * `Prisma.defineExtension` — ATAYLAB (oddiy `client.$extends({...})` emas).
 *
 * Klient `omit: { user: { passwordHash: true } }` bilan yaratilgani uchun
 * uning turi standart `PrismaClient` GA MOS KELMAYDI (`user.findMany`
 * natijasida `passwordHash` maydoni yo'q). Shu sababli
 * `<T extends PrismaClient>` shaklidagi generik yordamchi TypeScript'da
 * yiqiladi. `defineExtension` esa kengaytmani klient turidan MUSTAQIL
 * e'lon qiladi va zanjir bo'ylab turlarni to'g'ri olib o'tadi.
 */
export const decimalNormalizationExtension = Prisma.defineExtension({
  name: 'decimal-to-number',
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        return normalizeDecimals(await query(args));
      },
    },
  },
});

/**
 * JURNAL O'ZGARMAS (immutable).
 *
 * `journal_entries` va `journal_lines` ustidagi HAR QANDAY yangilash
 * to'siladi. Xato yozuvni tuzatishning yagona to'g'ri yo'li — STORNO
 * (`journal.reverse()`): teskari yozuv qo'shiladi va audit izida xato
 * ham, tuzatish ham ko'rinib turadi.
 *
 * O'CHIRISH TO'SILMAYDI — ataylab: demo/test tozalash skriptlari unga
 * tayanadi va o'chirish KO'RINADI (yozuv yo'qoladi). Xavfli holat —
 * jimgina TAHRIR: summa o'zgaradi, hisobot boshqa raqam ko'rsatadi,
 * hech kim sezmaydi.
 *
 * CHEGARASI: bu ilova qatlamidagi himoya — xom SQL va Prisma Studio uni
 * chetlab o'tadi. Baza tomonidagi hamrohi —
 * `20260820120000_restrict_journal_and_salary_ownership_fks` migratsiyasi:
 * u jurnal EGASINI o'chirish orqali yo'qotishni FK darajasida to'sadi.
 */
const IMMUTABLE_MODELS = new Set(['JournalEntry', 'JournalLine']);
const MUTATING_OPS = new Set(['update', 'updateMany', 'upsert']);

export const journalImmutabilityExtension = Prisma.defineExtension({
  name: 'journal-immutability',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (IMMUTABLE_MODELS.has(model) && MUTATING_OPS.has(operation)) {
          // Express `ApiError(409, ..., { code: "JOURNAL_IMMUTABLE" })` beradi.
          // NestJS ekvivalenti — 409 va o'sha `code` javob tanasida.
          throw new ConflictException({
            success: false,
            message:
              "Jurnal yozuvi o'zgarmas. Tuzatish uchun storno (reverse) ishlating",
            code: 'JOURNAL_IMMUTABLE',
          });
        }
        return query(args);
      },
    },
  },
});
