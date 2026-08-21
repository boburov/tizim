/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `UPLOAD_DIR` — IKKI STEK BITTA PAPKANI KO'RSATISHI (B10).
 *
 * ── QAROR: KANONIK YO'L QAYSI ──
 *
 * Kanonik papka — EXPRESS ishlab chiqarishda ALLAQACHON ishlatayotgan
 * papka. Sabab muhokamaga ochiq emas: `StoredFile.relPath` bazada
 * `UPLOAD_DIR` GA NISBATAN saqlanadi. Ya'ni papkani "to'g'rilash"
 * bazadagi HAR BIR mavjud yozuvni yaroqsiz qiladi — biriktirmalar,
 * chiqim cheklari, qaytarim hujjatlari. Shuning uchun NestJS Express'ga
 * MOSLASHADI, aksincha EMAS.
 *
 * Bu repoda o'lchangan holat: `server/uploads` (haqiqiy fayllar shu
 * yerda), `server_nest/uploads` esa UMUMAN YO'Q.
 *
 * ── NEGA BU JIMGINA BUZILADI ──
 *
 * Ikkala stek `path.resolve(process.cwd(), UPLOAD_DIR)` ishlatadi, LEKIN
 * ular BOSHQA papkadan ishga tushadi (`server/` va `server_nest/`).
 * Qiymat NISBIY bo'lsa natija IKKI XIL bo'ladi, baza esa BITTA:
 *
 *   • NestJS orqali o'chirilgan fayl DISKDA QOLADI (`unlink` xatosi
 *     yutiladi), kvota hisoblagichi esa kamayadi — joy "bo'shadi" deb
 *     ko'rinadi, aslida bo'shamaydi;
 *   • NestJS orqali yuklangan fayl Express uchun TOPILMAYDI.
 *
 * Hech qanday xato chiqmaydi. Mavjud `StorageService` ogohlantirishi
 * FAQAT papka YO'Q bo'lsa ishlaydi — `server_nest/uploads` bir marta
 * yaratilib qolsa u ham jim bo'ladi.
 *
 * ⚠ IKKALA `.env` HAM `.gitignore` DA. Ya'ni hozirgi moslik FAQAT
 * mahalliy, KUZATILMAYDIGAN faylga tayanadi: toza checkout yoki yangi
 * deploy JIMGINA ikkiga bo'linadi. Aynan shuning uchun bu tekshiruv bor.
 *
 * ⚠ PAPKA O'ZGARTIRILMADI. Qaror — Express qayerda bo'lsa, NestJS ham
 * o'sha yerda. Bu test o'shani QULFLAB turadi, ko'chirmaydi.
 *
 * ISHLATISH:  node --env-file=../server/.env test/upload-dir-parity.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
import {
  readFileSync, existsSync, statSync, realpathSync,
  mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EXPRESS_CWD = path.join(ROOT, 'server');
const NEST_CWD = path.join(ROOT, 'server_nest');

const R = { pass: 0, fail: 0, unmeasured: 0 };
const ok = (n) => { R.pass += 1; console.log(`  ✅ ${n}`); };
const bad = (n, m) => { R.fail += 1; console.log(`  ❌ ${n}\n      ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`  ⚠️  ${n} — O'LCHANMADI: ${m}`); };

/** `.env` ni o'qiydi (yo'q bo'lsa bo'sh). */
const readEnvFile = (p) => {
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
};

const serverEnv = readEnvFile(path.join(EXPRESS_CWD, '.env'));
const nestEnv = readEnvFile(path.join(NEST_CWD, '.env'));

/**
 * ⚠ USTUNLIK TARTIBI HAR IKKALA ILOVANIKI BILAN AYNAN BIR XIL:
 *   • dotenv MAVJUD `process.env` NI BOSMAYDI — ya'ni haqiqiy muhit
 *     o'zgaruvchisi eng ustun;
 *   • NestJS `ConfigModule.forRoot({ envFilePath: ['.env', '../server/.env'] })`
 *     — birinchi fayl ustun (`app.module.ts`);
 *   • Express faqat `server/.env` ni o'qiydi (`config/env.js`).
 * Boshqacha yozilsa test HAQIQIY sozlamani emas, o'z taxminini o'lchardi.
 */
const rawExpress = process.env.UPLOAD_DIR ?? serverEnv.UPLOAD_DIR ?? 'uploads';
const rawNest =
  process.env.UPLOAD_DIR ?? nestEnv.UPLOAD_DIR ?? serverEnv.UPLOAD_DIR ?? 'uploads';

const expressDir = path.resolve(EXPRESS_CWD, rawExpress);
const nestDir = path.resolve(NEST_CWD, rawNest);

console.log('\n\x1b[1m`UPLOAD_DIR` PARITETI (B10)\x1b[0m\n');
console.log(`  express xom : ${JSON.stringify(rawExpress)}  (cwd: server/)`);
console.log(`  nest    xom : ${JSON.stringify(rawNest)}  (cwd: server_nest/)`);
console.log(`  express yo'l: ${expressDir}`);
console.log(`  nest    yo'l: ${nestDir}\n`);

// ── 1. MUTLAQ YO'L TALABI ────────────────────────────────────────────
// NISBIY qiymat ikki stek uchun MATEMATIK ravishda boshqa papka beradi
// (cwd har xil), ya'ni bu "xavf" emas, KAFOLATLANGAN tafovut.
if (!path.isAbsolute(rawNest)) {
  bad(
    'NestJS `UPLOAD_DIR` NISBIY',
    `"${rawNest}" — ikki stek boshqa cwd dan yuradi, ya'ni bu KAFOLATLANGAN ` +
      `tafovut.\n      Tuzatish: server_nest/.env da MUTLAQ yo'l bering ` +
      `(kanonik: ${expressDir}).`,
  );
} else {
  ok(`NestJS \`UPLOAD_DIR\` mutlaq yo'l`);
}

// ── 2. ASOSIY TEKSHIRUV: BITTA PAPKAMI ───────────────────────────────
// `realpath` ishlatiladi: symlink yoki `/private` prefiksi tufayli
// satrlar farq qilib, papka BIR XIL bo'lishi mumkin.
const real = (p) => { try { return realpathSync(p); } catch { return p; } };
if (real(expressDir) !== real(nestDir)) {
  bad(
    'IKKI STEK BOSHQA PAPKANI KO\'RSATADI',
    `express: ${real(expressDir)}\n      nest   : ${real(nestDir)}\n\n` +
      "      Baza BITTA: `StoredFile.relPath` shu papkaga nisbatan. Tafovut\n" +
      '      JIMGINA yo\'qolgan fayl va noto\'g\'ri kvota hisobini beradi.',
  );
} else {
  ok('ikkala stek AYNI papkani ko\'rsatadi');
}

// ── 3. KANONIK PAPKA HAQIQATAN BORMI ─────────────────────────────────
if (!existsSync(expressDir) || !statSync(expressDir).isDirectory()) {
  bad('kanonik papka yo\'q', `${expressDir} — Express fayl yoza olmaydi`);
} else {
  ok(`kanonik papka mavjud: ${expressDir}`);
}

// ── 4. MUSBAT NAZORAT: BAZADAGI FAYLLAR SHU YERDA TOPILADIMI ─────────
//
// ⚠ USIZ 1–3 TEKSHIRUVI YOLG'ON YASHIL BERISHI MUMKIN: ikkala stek ham
// BIR XIL, LEKIN NOTO'G'RI papkani ko'rsatsa yuqoridagi hamma narsa
// o'tardi. Bu yerda yo'l BAZAGA qarshi tasdiqlanadi.
const prisma = new PrismaClient();
try {
  const files = await prisma.storedFile.findMany({
    where: { isDeleted: false },
    select: { relPath: true },
    take: 25,
  });
  if (!files.length) {
    // ── ⚠ BO'SH BAZA — TEKSHIRUVNI O'TKAZIB YUBORMAYMIZ ──
    //
    // Ilgari bu yerda `skip` turardi va 1–3 tekshiruvi YOLG'ON YASHIL
    // bo'lib qolardi: ikkala stek BIR XIL, LEKIN NOTO'G'RI papkani
    // ko'rsatsa ham hammasi o'tardi. Aynan shu holat o'lchandi
    // (bazada bitta ham `StoredFile` yo'q edi).
    //
    // Endi test O'Z fikstursini yaratadi: kanonik papkaga HAQIQIY fayl
    // yoziladi va unga `StoredFile` qatori bog'lanadi. Shundan keyin
    // yo'l BAZAGA qarshi tasdiqlanadi. Yakunda ikkalasi ham
    // o'chiriladi va QOLDIQ O'LCHANADI.
    const relPath = path.join('__parity_updir', `${Date.now()}.bin`);
    const abs = path.join(expressDir, relPath);
    let row = null;
    try {
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, Buffer.from('parity'));
      row = await prisma.storedFile.create({
        data: {
          originalName: '__parity_updir.bin',
          storedName: path.basename(relPath),
          relPath,
          mimeType: 'application/octet-stream',
          size: 6,
          purpose: 'assignment',
        },
        select: { id: true },
      });

      // ⚠ BAZADAN QAYTA O'QILADI — xotiradagi qiymatni emas, HAQIQIY
      // yozuvni tekshiramiz.
      const saved = await prisma.storedFile.findUnique({
        where: { id: row.id }, select: { relPath: true } });
      if (existsSync(path.join(expressDir, saved.relPath))) {
        ok(`bazadagi yo'l kanonik papkada topildi (fikstura): ${saved.relPath}`);
      } else {
        bad('BAZADAGI YO\'L TOPILMADI',
          `${saved.relPath} → ${expressDir} ostida yo'q — kanonik yo'l NOTO'G'RI`);
      }
    } catch (err) {
      bad('fikstura yaratilmadi', err.message);
    } finally {
      try { rmSync(abs, { force: true }); } catch { /* yo'q bo'lsa mayli */ }
      try { rmSync(path.dirname(abs), { recursive: true, force: true }); } catch { /* mayli */ }
      if (row) await prisma.storedFile.deleteMany({ where: { id: row.id } });
      const left = row
        ? await prisma.storedFile.count({ where: { id: row.id } })
        : 0;
      if (left === 0 && !existsSync(abs)) ok("fikstura tozalandi — QOLDIQ YO'Q (o'lchandi)");
      else bad('fikstura QOLDIG\'I', `qator: ${left}, fayl: ${existsSync(abs)}`);
    }
  } else {
    const missing = files.filter((f) => !existsSync(path.join(expressDir, f.relPath)));
    if (missing.length === files.length) {
      bad(
        'BAZADAGI FAYLLARNING BIRORTASI TOPILMADI',
        `${files.length} ta yozuvdan 0 tasi ${expressDir} ostida bor — ` +
          "ya'ni kanonik yo'l NOTO'G'RI (ikkala stek ham xato joyga qarayapti).",
      );
    } else if (missing.length) {
      // Bir nechtasi yo'q bo'lishi mumkin (B11: havola uzilmaydi) —
      // bu yo'l xatosi emas, shuning uchun ogohlantirish.
      skip(
        'bazadagi fayllar',
        `${missing.length}/${files.length} ta fayl diskda yo'q — yo'l TO'G'RI ` +
          '(qolganlari topildi), lekin yetim yozuvlar bor (B11).',
      );
    } else {
      ok(`bazadagi ${files.length} ta faylning hammasi kanonik papkada topildi`);
    }
  }
} finally {
  await prisma.$disconnect();
}

console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`);
process.exit(R.fail ? 1 : 0);
