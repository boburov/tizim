/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAVJUD LOYIHALARNI SAQLAB QOLISH (grandfather).
 *
 * ⚠ KALITLAR JORIY QILINGAN DEPLOYDA SHU SKRIPT YURGIZILISHI SHART.
 *
 * Modul darvozalari YOPIQ yiqiladi va standart holat — O'CHIQ. Ya'ni
 * kalitlar joriy qilingan zahoti, hech kim hech narsa qilmasa, HAR BIR
 * mavjud mijozning shu bo'limlari o'chib qoladi. Bu skript har bir FAOL
 * loyihaga ustun qaror yozib, ular bugun ega bo'lgan narsani saqlab
 * qoladi.
 *
 * ── ⚠ OBUNASI YO'Q LOYIHALAR HAM KIRADI ──
 *
 * `compactForTenant` obunasi yo'q loyiha uchun bo'sh limit qaytaradi.
 * Faqat obunasi borlarga bersak, obunasiz (lekin ISHLAYOTGAN) loyihalar
 * qorong'i qolardi — aynan shu eng jimgina va eng og'riqli xato bo'lardi.
 * Shuning uchun shart FAQAT `status = ACTIVE`.
 *
 * ── ⚠ IDEMPOTENT ──
 *
 * Mavjud ustun qarorga TEGMAYDI. Qayta yurgizish xavfsiz va allaqachon
 * qo'lda o'chirilgan bo'limni qaytadan yoqib yubormaydi.
 *
 * ISHLATISH:  node scripts/grandfather-features.mjs [--dry]
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';

const dry = process.argv.includes('--dry');
const ACTOR = 'system:grandfather';
const REASON =
  "Modul o'chirgichlari joriy qilinishidan oldin mavjud bo'lgan huquq saqlab qolindi";

const prisma = new PrismaClient();

const main = async () => {
  const [tenants, features] = await Promise.all([
    prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, domain: true },
    }),
    prisma.feature.findMany({ where: { isModule: true, isActive: true } }),
  ]);

  console.log(
    `${tenants.length} ta FAOL loyiha × ${features.length} ta modul kaliti\n`,
  );
  if (!tenants.length || !features.length) {
    console.log('Qiladigan ish yo\'q.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const t of tenants) {
    for (const f of features) {
      const existing = await prisma.tenantFeatureOverride.findUnique({
        where: {
          tenantId_featureKey_branchId: {
            tenantId: t.id,
            featureKey: f.key,
            branchId: '',
          },
        },
      });
      // ⚠ MAVJUD QARORGA TEGILMAYDI — qo'lda o'chirilgan bo'lim qayta
      // yoqilib ketmasin.
      if (existing) {
        skipped += 1;
        continue;
      }

      created += 1;
      if (dry) continue;
      await prisma.tenantFeatureOverride.create({
        data: {
          tenantId: t.id,
          featureId: f.id,
          featureKey: f.key,
          enabled: true,
          reason: REASON,
          createdBy: ACTOR,
        },
      });
    }
    console.log(`  ${t.domain.padEnd(32)} ${t.name}`);
  }

  console.log(
    dry
      ? `\n(--dry) ${created} ta yoziladi, ${skipped} ta o'tkazib yuboriladi`
      : `\n✅ ${created} ta ustun qaror yozildi, ${skipped} ta allaqachon bor edi`,
  );
  console.log(
    '\n⚠ Keyingi qadam: tenant serverlar yangi holatni 15 daqiqada ' +
      '(heartbeat) oladi. Tezroq kerak bo\'lsa panelda har bir loyihani ' +
      'oching — ochilishning o\'zi turtki yubormaydi, lekin har qanday ' +
      'o\'zgartirish yuboradi.',
  );
};

main()
  .catch((err) => {
    console.error('❌ Yiqildi:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
