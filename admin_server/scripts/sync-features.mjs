/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODUL REYESTRINI ADMIN BAZASIGA SINXRONLASH.
 *
 * YAGONA HAQIQAT MANBAI — TENANT KODIDAGI REYESTR:
 *     server/src/common/features/feature-registry.ts
 *
 * Sabab: bog'liqlik grafigi (`requires`) KOD bo'lishi shart — uni haqiqiy
 * NestJS import'lariga qarshi tekshirib turamiz (`server/test/feature-graph`).
 * Admin bazasidagi `Feature` qatorlari esa uning ISH VAQTIDAGI proyeksiyasi,
 * chunki admin_server tenant kodini import qila olmaydi.
 *
 * ⚠ REYESTR TS FAYLIDAN TO'G'RIDAN-TO'G'RI O'QILADI.
 * Node 24 tip'larni o'zi tashlab yuboradi va reyestrda dekorator yo'q.
 * Oraliq JSON ataylab YASALMAYDI: har oraliq nusxa — eskirish ehtimoli.
 *
 * ── ⚠ NIMANI O'ZGARTIRMAYDI ──
 *
 * Bu skript FAQAT katalogni to'ldiradi. U hech kimga hech narsa BERMAYDI
 * va OLMAYDI: tarifga biriktirish (`PlanFeature`) va loyihaviy ustun
 * qarorlar alohida. Ya'ni skriptni istalgan vaqtda qayta yurgizsa bo'ladi.
 *
 * ── ⚠ HECH NARSA O'CHIRILMAYDI ──
 *
 * Reyestrdan olib tashlangan kalit bazada `isActive = false` bo'ladi,
 * o'chirilmaydi. Qator o'chirilsa unga bog'langan `PlanFeature` va
 * `TenantFeatureOverride` qatorlari kaskad bilan yo'q bo'lardi — ya'ni
 * kalitni reyestrdan bir zumga olib tashlash mijozlarning tijorat
 * konfiguratsiyasini QAYTARIB BO'LMAYDIGAN qilib yo'q qilardi.
 *
 * ISHLATISH:  node scripts/sync-features.mjs [--dry]
 * ═══════════════════════════════════════════════════════════════════════════
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = path.resolve(
  HERE,
  '../../server/src/common/features/feature-registry.ts',
);

const dry = process.argv.includes('--dry');
const prisma = new PrismaClient();

const main = async () => {
  const { FEATURES } = await import(REGISTRY);
  console.log(`Reyestr: ${FEATURES.length} ta kalit (${REGISTRY})\n`);

  const keys = new Set(FEATURES.map((f) => f.key));

  for (const f of FEATURES) {
    const data = {
      name: f.label,
      type: 'BOOLEAN',
      isModule: true,
      parentKey: f.parent ?? null,
      requiresKeys: f.requires ?? [],
      isActive: true,
    };

    const existing = await prisma.feature.findUnique({ where: { key: f.key } });
    const verb = existing ? 'yangilanadi' : 'YARATILADI';
    console.log(`  ${verb.padEnd(11)} ${f.key}  — ${f.label}`);

    if (dry) continue;
    await prisma.feature.upsert({
      where: { key: f.key },
      // ⚠ `description` ga tegilmaydi: uni panelda qo'lda yozish mumkin
      // va sinxronlash uni o'chirib yuborishi kerak emas.
      create: { key: f.key, ...data },
      update: data,
    });
  }

  // Reyestrdan chiqib ketgan kalitlar — O'CHIRILMAYDI, faqat so'ndiriladi.
  const orphans = await prisma.feature.findMany({
    where: { isModule: true, isActive: true, key: { notIn: [...keys] } },
  });
  for (const o of orphans) {
    console.log(`  SO'NDIRILADI ${o.key}  — reyestrda yo'q`);
    if (!dry) {
      await prisma.feature.update({
        where: { id: o.id },
        data: { isActive: false },
      });
    }
  }

  console.log(
    dry
      ? '\n(--dry: bazaga hech narsa yozilmadi)'
      : `\n✅ ${FEATURES.length} ta kalit sinxronlandi, ${orphans.length} ta so'ndirildi`,
  );
};

main()
  .catch((err) => {
    console.error('❌ Sinxronlash yiqildi:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
