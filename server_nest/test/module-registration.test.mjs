/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROY'XATDAN O'TKAZISH QO'RIQCHISI — "modul bor, lekin marshrut yo'q".
 *
 * ── QANDAY XATONI TUTADI ──
 *
 * NestJS FAQAT ildiz moduldan (`AppModule`) ERISHILADIGAN modullarning
 * kontrollerlarini ro'yxatga oladi. Modul fayli yozilgan, commit qilingan
 * va testlari yashil bo'lishi mumkin — lekin `app.module.ts` ga
 * qo'shilmagan bo'lsa uning HAR BIR marshruti 404 qaytaradi.
 *
 * BU HAQIQATAN SODIR BO'LDI. `courses` (9 marshrut) va `attendance`
 * (11 marshrut) commit xabarlarida "ko'chirildi" deb belgilangan, paritet
 * testlari yashil edi — chunki ular ISHLAB TURGAN jarayonga (ish
 * daraxtidan qurilgan) qarshi ishlardi. HEAD'dan toza qurilgan nusxada
 * esa ikkalasi ham 404 berardi. Ya'ni 20 ta marshrut "ko'chirilgan" deb
 * sanalib, aslida yo'q edi.
 *
 * `groups` TASODIFAN ishlab turgandi: uni `AuthModule` o'qituvchi profili
 * uchun import qiladi. Bunday BILVOSITA bog'liqlik qo'lda ushlab
 * bo'lmaydigan tuzoq — shuning uchun tekshiruv avtomatlashtirildi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ── TUZATISHDAN KEYINGI QO'SHIMCHA TEKSHIRUVLAR ──
 *
 * Birinchi nusxa TO'RTTA ko'r nuqtaga ega edi. Har biri "modul
 * ro'yxatdan o'tgan" degan YOLG'ON YASHIL berardi:
 *
 *   1. BITTA FAYLDA BIR NECHTA `@Module` — `imports` massivi faylda
 *      BIR MARTA qidirilardi va BIRINCHI moduldan olingan ro'yxat
 *      o'sha fayldagi HAMMA modulga tegishli deb hisoblanardi.
 *      Repoda bunday fayl 6 ta (`jobs.module.ts` da 3 ta modul!) —
 *      ya'ni erishish grafi ALLAQACHON noto'g'ri hisoblanardi.
 *
 *   2. `@Controller` NING FAQAT BITTA SHAKLI. Regex `'yakka qo'shtirnoq'`
 *      yoki `[massiv]` argumentini talab qilardi. `@Controller()`,
 *      `@Controller("qo'sh")` yoki `@Controller({ path: 'x' })` yozgan
 *      modul diskda UMUMAN KO'RINMASDI — demak "ro'yxatdan o'tmagan"
 *      deb ham belgilanmasdi. Qo'riqchi eng yangi kodni ko'rmaydi.
 *
 *   3. TAKRORIY RO'YXATGA OLISH tekshirilmasdi. Bitta kontroller ikki
 *      modulda bo'lsa NestJS uning marshrutlarini IKKI MARTA ulaydi
 *      (birinchisi g'olib) — qo'riqchi buni "ro'yxatdan o'tgan" deb
 *      belgilardi.
 *
 *   4. FAQAT MANBA tekshirilardi, QURILMA emas. Aynan shu tafovut
 *      asl xatoni yashirgan edi: `src/` to'g'ri, `dist/` esa eski.
 *      Endi AYNI erishish tahlili `dist/` ustida ham yuritiladi va
 *      ikki natija TENG bo'lishi talab qilinadi.
 *
 * ── NEGA STATIK ──
 * HTTP ham, baza ham kerak emas: tezlik chegarasi (429), qo'shni agent
 * yoki bo'sh ma'lumot bu tekshiruvni BUZA OLMAYDI.
 *
 * ISHLATISH:
 *   npm run build && npm run test:module-registration
 *   node test/module-registration.test.mjs --src-only   (qurilmasiz, tez)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const SRC_ONLY = process.argv.includes('--src-only');

const R = { fail: 0, unmeasured: 0 };
const bad = (n, m) => { R.fail += 1; console.log(`\n  ❌ ${n}\n     ${m}`); };
const skip = (n, m) => { R.unmeasured += 1; console.log(`\n  ⚠️  ${n} — O'LCHANMADI: ${m}`); };

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const read = (p) => readFileSync(p, 'utf8');

/**
 * `open` belgisidan boshlab MOS yopuvchi belgigacha bo'lgan matn.
 * Qavslar SANALADI — ichma-ich `[...]`/`{...}` bor (masalan
 * `imports: [ConfigModule.forRoot({ ... })]`).
 *
 * @returns `{ inner, end }` yoki `null`
 */
const balanced = (text, from, open, close) => {
  const start = text.indexOf(open, from);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(start + 1, i), end: i };
    }
  }
  return null;
};

/**
 * ═══════════════════════════════════════════════════════════════════════
 * IZOHLARNI OLIB TASHLAYDI (satr literallariga TEGMASDAN).
 *
 * ⚠ NEGA SHART: sinf nomlari massiv matnidan regex bilan olinadi, ya'ni
 * IZOHGA OLINGAN modul ham "import qilingan" deb sanalardi:
 *
 *     imports: [
 *       // CoursesModule,      ← 9 marshrut o'ldi, qo'riqchi YASHIL
 *     ]
 *
 * O'LCHANDI: `CoursesModule` ni izohga olib qo'riqchi ishga tushirilganda
 * u "51/51 modul erishiladi, 44/44 kontroller ro'yxatda" deb chiqdi va
 * 0 kod bilan tugadi. Modulni vaqtincha o'chirib qo'yish — xatolarni
 * qidirishda ENG KO'P uchraydigan harakat, ya'ni bu nazariy tuzoq emas.
 *
 * Faqat `imports`/`controllers` massivi matniga qo'llanadi: u yerda
 * regex literali bo'lmaydi, shuning uchun tirnoqni hisobga olish yetadi.
 * ═══════════════════════════════════════════════════════════════════════
 */
const stripComments = (text) => {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      out += c;
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') { out += '  '; i += 2; continue; }
        out += text[i];
        i += 1;
        if (text[i - 1] === c) break;
      }
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
};

/** Ob'yekt matnidan `key: [ ... ]` massivini oladi (balanslangan, izohsiz). */
const arrayProp = (objText, key) => {
  const m = new RegExp(`(^|[\\s,{])${key}\\s*:\\s*\\[`).exec(objText);
  if (!m) return '';
  const b = balanced(objText, m.index + m[0].length - 1, '[', ']');
  return b ? stripComments(b.inner) : '';
};

/** `[A, B, C]` matnidan sinf nomlarini oladi (matn IZOHSIZ bo'lishi shart). */
const classNames = (arrText, suffix) =>
  [...arrText.matchAll(new RegExp(`\\b([A-Z]\\w*${suffix})\\b`, 'g'))].map((m) => m[1]);

/**
 * ═══════════════════════════════════════════════════════════════════════
 * BITTA DARAXTNI (src yoki dist) TAHLIL QILADI.
 *
 * MANBA (`.ts`):   `@Module({...})` \n `export class GroupsModule`
 * QURILMA (`.js`): `GroupsModule = __decorate([ Module({...}),
 *                    __metadata(...) ], GroupsModule);`
 *
 * ⚠ QURILMADA SINF NOMI DEKORATORDAN KEYIN DARHOL KELMAYDI. Konstruktori
 * bor modulga tsc `Module({...})` dan SO'NG yana `__metadata(...)`
 * qo'shadi. "Yopuvchi qavsdan keyin nom keladi" degan sodda taxmin shu
 * yerda buziladi: `Groups`, `TeacherSalary`, `Deposits`, `Expenses`
 * modullari — ya'ni aynan KATTA modullar — qo'riqchiga ko'rinmasdi.
 * Shuning uchun nom O'RAB TURGAN `__decorate([...], NOM)` dan olinadi.
 *
 * ⚠ DEKORATOR SATR BOSHIDA BO'LISHI TALAB QILINADI (`^\s*`). Aks holda
 * IZOHDA tilga olingan dekorator ham e'lon deb o'qilardi: haqiqatan
 * `expense-approvals.controller.ts` ning izohida `@Controller([...])`
 * yozilgan va u ikkinchi (soxta) e'lon bo'lib chiqdi.
 * ═══════════════════════════════════════════════════════════════════════
 */
const analyze = (root, ext) => {
  const files = walk(root).filter((f) => f.endsWith(ext) && !f.endsWith(`.d${ext}`));

  /** sinf → { imports[], controllers[], file } */
  const modules = new Map();
  /** sinf → { file, mount, routes } */
  const controllers = new Map();
  /** kontroller sinfi → uni e'lon qilgan modullar */
  const declaredIn = new Map();
  const problems = [];
  /** Qo'riqchining O'ZINI tekshirish uchun: diskdagi HAMMA sinf nomi. */
  const seenClasses = { Module: new Set(), Controller: new Set() };

  /**
   * Dekorator argumenti tugagan joydan sinf nomini topadi.
   * @param decStart dekorator so'zining boshlanishi
   * @param argEnd   argument qavsining yopilish indeksi
   */
  const ownerClass = (text, decStart, argEnd) => {
    // ── QURILMA: o'rab turgan `__decorate([ ... ], NOM)` ──
    const dec = text.lastIndexOf('__decorate(', decStart);
    if (dec >= 0) {
      const call = balanced(text, dec, '(', ')');
      if (call && call.end > argEnd) {
        const m = /,\s*([A-Za-z_$][\w$]*)\s*$/.exec(call.inner);
        if (m) return m[1];
      }
    }
    // ── MANBA: dekoratordan keyingi `class NOM` ──
    const m = /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/
      .exec(text.slice(argEnd, argEnd + 4000));
    return m ? m[1] : null;
  };

  for (const f of files) {
    const t = read(f);
    const rel = path.relative(root, f);

    for (const kind of ['Module', 'Controller']) {
      for (const m of t.matchAll(new RegExp(`^[ \\t]*@?${kind}\\s*\\(`, 'gm'))) {
        const b = balanced(t, m.index, '(', ')');
        if (!b) continue;
        const cls = ownerClass(t, m.index, b.end);
        if (!cls || !cls.endsWith(kind)) continue;

        const store = kind === 'Module' ? modules : controllers;
        if (store.has(cls)) {
          problems.push(`${cls}: BIR NECHTA e'lon — ${store.get(cls).file} va ${rel}`);
          continue;
        }

        if (kind === 'Module') {
          const imports = classNames(arrayProp(b.inner, 'imports'), 'Module');
          const ctrls = classNames(arrayProp(b.inner, 'controllers'), 'Controller');

          // ⚠ TAKRORIY IMPORT — bitta massivda bir modul ikki marta.
          // NestJS jimgina yutadi, lekin bu deyarli har doim yarim
          // tahrirning izi ("birini o'chirmoqchi edim").
          for (const [label, arr] of [['import', imports], ['controller', ctrls]]) {
            const dup = [...new Set(arr.filter((x, i) => arr.indexOf(x) !== i))];
            if (dup.length) {
              problems.push(`${cls} (${rel}): TAKRORIY ${label} — ${dup.join(', ')}`);
            }
          }
          modules.set(cls, { imports, controllers: ctrls, file: rel });
          for (const c of ctrls) declaredIn.set(c, [...(declaredIn.get(c) || []), cls]);
        } else {
          // ⚠ ARGUMENT SHAKLI CHEKLANMAYDI: `()`, `'x'`, `"x"`, `` `x` ``,
          // `['a','b']`, `{ path: 'x' }` — hammasi tutiladi. Aks holda
          // boshqacha yozilgan YANGI modul qo'riqchiga KO'RINMASDI.
          const q = /['"`]([^'"`]*)['"`]/.exec(b.inner);
          const mount = b.inner.trim() === '' ? '' : (q ? q[1] : '?');
          const routes = [...t.slice(b.end)
            .matchAll(/^[ \t]*@?(?:Get|Post|Put|Patch|Delete|All|Head|Options)\s*\(/gm)]
            .length;
          controllers.set(cls, { file: rel, mount, routes });
        }
      }
    }

    // ── QO'RIQCHINING O'Z-O'ZINI TEKSHIRUVI uchun xom sinf ro'yxati ──
    // Satr boshiga bog'langan: izohdagi (` * ... class XModule ...`)
    // eslatma e'lon deb sanalmasin. Qurilmadagi `let X = class X {`
    // shakli ham qamrab olinadi.
    for (const kind of ['Module', 'Controller']) {
      const re = new RegExp(
        `^[ \\t]*(?:export\\s+)?(?:(?:let|const|var)\\s+[\\w$]+\\s*=\\s*)?` +
          `(?:abstract\\s+)?class\\s+([A-Za-z_$][\\w$]*${kind})\\b`,
        'gm',
      );
      for (const m of t.matchAll(re)) seenClasses[kind].add(m[1]);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ⚠ QO'RIQCHI O'ZINI TEKSHIRADI.
  //
  // Diskda `class XController` bor, lekin dekorator TAHLILIGA tushmagan
  // bo'lsa — bu "hammasi ro'yxatdan o'tgan" degan YOLG'ON YASHIL. Aynan
  // shu tarzda `@Controller("qo'sh tirnoq")` yozgan modul ko'rinmay
  // qolardi. Parser sinishi ENDI JIM QOLMAYDI.
  // ═══════════════════════════════════════════════════════════════════
  for (const kind of ['Module', 'Controller']) {
    const found = kind === 'Module' ? modules : controllers;
    const blind = [...seenClasses[kind]].filter((c) => !found.has(c));
    if (blind.length) {
      problems.push(
        `QO'RIQCHI KO'RMADI (parser nuqsoni) — ${kind}: ${blind.join(', ')}`,
      );
    }
  }

  // ── AppModule dan erishiladigan modullar ──
  const reachable = new Set();
  const stack = ['AppModule'];
  while (stack.length) {
    const cur = stack.pop();
    if (reachable.has(cur) || !modules.has(cur)) continue;
    reachable.add(cur);
    stack.push(...modules.get(cur).imports);
  }

  // ── ro'yxatdan o'tgan kontrollerlar ──
  const registered = new Set();
  for (const mod of reachable) {
    for (const c of modules.get(mod).controllers) registered.add(c);
  }

  // ⚠ BITTA KONTROLLER — BITTA MODUL. Ikki ERISHILADIGAN modul uni
  // e'lon qilsa NestJS marshrutlarni ikki marta ulaydi va qaysi
  // qo'riqchi/middleware ishlashi e'lon TARTIBIGA bog'lanib qoladi.
  for (const [c, mods] of declaredIn) {
    const live = mods.filter((m) => reachable.has(m));
    if (live.length > 1) {
      problems.push(`${c}: ${live.length} ta modulda ro'yxatda — ${live.join(', ')}`);
    }
  }

  return { modules, controllers, reachable, registered, problems };
};

console.log(`\n\x1b[1mROY'XATDAN O'TKAZISH QO'RIQCHISI\x1b[0m\n`);

// ═══════════════════════════════════════════════════════════════════════
// 1. MANBA (`src/`)
// ═══════════════════════════════════════════════════════════════════════
const src = analyze(SRC, '.ts');
const orphans = [...src.controllers.entries()].filter(([c]) => !src.registered.has(c));

console.log(`  ── manba (src/) ──`);
console.log(`  erishiladigan modul : ${src.reachable.size} / ${src.modules.size}`);
console.log(`  diskdagi kontroller : ${src.controllers.size}`);
console.log(`  ro'yxatdan o'tgan   : ${src.controllers.size - orphans.length}`);

if (orphans.length) {
  const lost = orphans.reduce((n, [, v]) => n + v.routes, 0);
  bad(
    `${orphans.length} ta kontroller RO'YXATDAN O'TMAGAN — ${lost} ta marshrut 404 qaytaradi`,
    orphans.map(([c, v]) => `${c}  →  /api/${v.mount}  (${v.routes} marshrut)  ${v.file}`)
      .join('\n     ') +
      "\n\n     Tuzatish: modulni `src/app.module.ts` dagi `imports` ga qo'shing.",
  );
}
for (const p of src.problems) bad('manba tuzilmasi', p);

// ═══════════════════════════════════════════════════════════════════════
// 2. QURILMA (`dist/`) — ASL XATO AYNAN SHU YERDA YASHIRINGAN EDI.
//
// `src/` to'g'ri bo'lib, `dist/` eski bo'lishi MUMKIN (tsc incremental
// keshi, yarim tugagan build, `deleteOutDir` poygasi). O'shanda
// `npm start` ESKI grafni ko'taradi va marshrut 404 beradi — manba
// tekshiruvi esa YASHIL turadi.
// ═══════════════════════════════════════════════════════════════════════
if (SRC_ONLY) {
  console.log(`\n  \x1b[2m── qurilma (dist/) — --src-only bilan o'tkazib yuborildi ──\x1b[0m`);
} else if (!existsSync(path.join(DIST, 'app.module.js'))) {
  skip(
    'qurilma (dist/) tekshiruvi',
    "dist/app.module.js yo'q — `npm run build` qiling. " +
      "Bu tekshiruvsiz natija ESKI qurilma haqida HECH NARSA demaydi " +
      '(`--src-only` bilan ataylab o\'tkazib yuborish mumkin).',
  );
} else {
  const dist = analyze(DIST, '.js');
  console.log(`\n  ── qurilma (dist/) ──`);
  console.log(`  erishiladigan modul : ${dist.reachable.size} / ${dist.modules.size}`);
  console.log(`  ro'yxatdan o'tgan   : ${dist.registered.size}`);

  for (const p of dist.problems) bad('qurilma tuzilmasi', p);

  // ⚠ TO'PLAMLAR TENG BO'LISHI SHART. Faqat sonlarni solishtirish
  // yetarli emas: bittasi qo'shilib bittasi tushib qolsa son o'zgarmasdi.
  const missing = [...src.registered].filter((c) => !dist.registered.has(c));
  const extra = [...dist.registered].filter((c) => !src.registered.has(c));
  if (missing.length || extra.length) {
    bad(
      "QURILMA MANBAGA MOS EMAS — `dist/` ESKI (ishlab turgan jarayon 404 beradi)",
      (missing.length ? `qurilmada YO'Q: ${missing.join(', ')}\n     ` : '') +
        (extra.length ? `qurilmada ORTIQCHA: ${extra.join(', ')}\n     ` : '') +
        'Tuzatish: `rm -rf dist && npm run build`',
    );
  } else {
    console.log(`  ✅ qurilma manba bilan AYNAN mos (${dist.registered.size} kontroller)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
if (R.fail || R.unmeasured) {
  console.log(
    `\n  Natija: ${R.fail} yiqildi, ${R.unmeasured} o'lchanmadi\n`,
  );
  process.exit(1);
}
console.log(`\n  ✅ HAR BIR kontroller \`AppModule\` dan erishiladi — manbada ham, qurilmada ham\n`);
process.exit(0);
