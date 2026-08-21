/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIXTURE GIGIYENASI — CHIQARISH DARVOZASI.
 *
 * Har bir paritet to'plami o'z fixture'ini o'zi tozalaydi. Lekin
 * "tozaladim" degan da'vo TO'PLAMNING O'ZI ichida tekshiriladi — ya'ni
 * tozalash mantig'i ham, uni tasdiqlovchi tekshiruv ham BIR XIL noto'g'ri
 * taxminga tayanishi mumkin. Aynan shu sodir bo'lgan:
 *
 *   `branches-parity` tozalashni `DELETE /branches/:id` bilan qilardi
 *   (YUMSHOQ o'chirish — qator qoladi), yakuniy tekshiruvni esa
 *   `GET /branches?includeInactive=true` bilan (u `isDeleted:true`
 *   qatorlarni QAYTARMAYDI). Ikkalasi bir xil ko'rlikka ega edi, shuning
 *   uchun to'plam 2 kun davomida "✅ sinov obyektlari qolmadi" deb
 *   yozib turdi va bazada 28 ta `__parity_` filiali to'plandi —
 *   bazadagi 40 filialning 70%.
 *
 * Bu fayl TO'PLAMLARDAN TASHQARIDA turadi va faqat BAZAGA qaraydi.
 * Uni har qanday to'plamdan KEYIN yurgizish mumkin.
 *
 * ── NIMANI O'LCHAYDI ──
 *
 *   1. QOLDIQ  — sinov prefiksli qator (yumshoq o'chirilgani ham).
 *   2. HUQUQ   — QA fixture foydalanuvchilari o'z BAZAVIY rolida
 *                (`user.role` VA `branchAssignments[].role`).
 *   3. MUZLASH — birorta rol muzlatilgan holda qolmagan.
 *
 * ⚠ (2) NEGA MUHIM: to'plamlar `qa_*` foydalanuvchisini vaqtincha
 * KUCHLI/ZAIF rolga o'tkazadi. Tiklash yiqilsa test YASHIL tugashi
 * mumkin (tiklash odatda `finally` da, tekshiruvdan KEYIN), fixture esa
 * boshqa rolda qolib ketadi — keyingi to'plamlar esa buni "paritet
 * farqi" yoki "ruxsat xatosi" deb ko'rsatadi va soatlab quvlanadi.
 *
 * ⚠ BAZAVIY ROL QATTIQ YOZILMAGAN: u konvensiyadan olinadi —
 * `qa_staff_a` → `qa_staff`, `qa_admin_b` → `qa_admin`. Ro'yxat
 * yozilsa u muqarrar ravishda seed'dan uzoqlashardi.
 *
 * ISHLATISH:  node --env-file=../server/.env test/fixture-residue.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** To'plamlar ishlatadigan prefikslar (`grep "PREFIX =" test/`). */
const PREFIXES = ['__parity_', 'parity-', 'qa_lc_', '__probe_'];

/** Prefiks qidiriladigan matn maydonlari. */
const TEXT_FIELDS = ['name', 'label', 'value', 'username', 'code', 'title'];

const R = { pass: 0, fail: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };

console.log('\n\x1b[1mFIXTURE GIGIYENASI\x1b[0m\n');

// ═══════════════════════════════════════════════════════════════════════
// 1. QOLDIQ — HAR BIR modelning HAR BIR matn maydoni bo'yicha.
//
// ⚠ RO'YXAT QO'LDA YOZILMAYDI: modellar Prisma ning ish vaqti
// modelidan olinadi. Qo'lda yozilgan ro'yxat yangi jadval qo'shilganda
// JIMGINA eskirardi — ya'ni darvoza ochilib qolardi va buni hech narsa
// ko'rsatmasdi.
// ═══════════════════════════════════════════════════════════════════════
const models = Object.entries(prisma._runtimeDataModel?.models || {});
if (!models.length) {
  bad('model ro\'yxati', "Prisma ish vaqti modeli o'qilmadi — tekshiruv BAJARILMADI");
}

const residue = [];
let scanned = 0;
for (const [model, def] of models) {
  const client = prisma[model[0].toLowerCase() + model.slice(1)];
  if (!client?.count) continue;
  const fields = def.fields
    .filter((f) => TEXT_FIELDS.includes(f.name) && f.type === 'String')
    .map((f) => f.name);
  if (!fields.length) continue;
  for (const field of fields) {
    scanned += 1;
    for (const prefix of PREFIXES) {
      // ⚠ `isDeleted` FILTRLANMAYDI. Yumshoq o'chirilgan qator ham
      // QOLDIQ: u bazada turadi, sanoqlarni siljitadi va cheksiz
      // to'planadi. Aynan shu ko'rlik 28 ta qatorni yashirgan edi.
      const n = await client.count({ where: { [field]: { startsWith: prefix } } });
      if (n) residue.push({ model, field, prefix, n });
    }
  }
}

if (residue.length) {
  bad(
    `${residue.reduce((a, r) => a + r.n, 0)} ta SINOV QATORI bazada qoldi`,
    residue.map((r) => `${r.model}.${r.field} "${r.prefix}*" → ${r.n} ta`).join('\n      ') +
      '\n\n      Qaysi to\'plam qoldirganini prefiksdan toping (`grep "PREFIX =" test/`).',
  );
} else {
  ok(`sinov qoldig'i yo'q (${models.length} model, ${scanned} maydon tekshirildi)`);
}

// ═══════════════════════════════════════════════════════════════════════
// 2. HUQUQ — QA fixture foydalanuvchilari BAZAVIY rolida.
// ═══════════════════════════════════════════════════════════════════════
const qaUsers = await prisma.user.findMany({
  where: { username: { startsWith: 'qa_' } },
  select: {
    username: true,
    role: true,
    branchAssignments: { select: { role: true, branchId: true } },
  },
});

if (!qaUsers.length) {
  // ⚠ MUSBAT NAZORAT: fixture topilmasa tekshiruv BAJARILMAGAN, ya'ni
  // "hammasi joyida" degan xulosa asossiz bo'lardi.
  bad('QA fixture foydalanuvchilari', "birorta `qa_*` topilmadi — tekshiruv BAJARILMADI");
} else {
  const drifted = [];
  for (const u of qaUsers) {
    // `qa_staff_a` → `qa_staff` (oxiridagi `_<harf>` olib tashlanadi).
    const expected = u.username.replace(/_[a-z]$/, '');
    if (u.role !== expected) {
      drifted.push(`${u.username}: user.role = "${u.role}", kutilgan "${expected}"`);
    }
    for (const a of u.branchAssignments) {
      if (a.role !== expected) {
        drifted.push(
          `${u.username}: branchAssignments[${a.branchId}].role = "${a.role}", ` +
            `kutilgan "${expected}"`,
        );
      }
    }
  }
  if (drifted.length) {
    bad(
      'FIXTURE HUQUQI TIKLANMAGAN — foydalanuvchi sinov rolida qoldi',
      drifted.join('\n      ') +
        '\n\n      Bu keyingi to\'plamlarni tushunarsiz 401/403 bilan yiqitadi.',
    );
  } else {
    ok(`${qaUsers.length} ta QA fixture foydalanuvchisi bazaviy rolida`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. MUZLASH — `frozen-role-check` rolni muzlatib qoldirmadimi.
//
// ⚠ MUZLATILGAN ROL ENG YOMON QOLDIQ: u bilan LOGIN 403 beradi, ya'ni
// o'sha rolga tayanadigan HAR BIR to'plam o'lchovsiz qoladi.
// ═══════════════════════════════════════════════════════════════════════
const frozen = await prisma.role.findMany({
  where: { isFrozen: true },
  select: { value: true, frozenReason: true },
});
if (frozen.length) {
  bad(
    `${frozen.length} ta rol MUZLATILGAN holda qoldi`,
    frozen.map((f) => `${f.value} — "${f.frozenReason || ''}"`).join('\n      ') +
      '\n\n      Muzlatishdan chiqaring: PATCH /api/roles/<value>/freeze {"isFrozen":false}',
  );
} else {
  ok('muzlatilgan rol yo\'q');
}

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
await prisma.$disconnect();
process.exit(R.fail ? 1 : 0);
