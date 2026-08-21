/**
 * FILIAL NIYATI TASDIG'I.
 *
 * SAVOL: "Client 'A filialga yozyapman' deb o'ylab turganda, server uni
 * jimgina B filialga yozib qo'ymasligiga ishonchim komilmi?"
 *
 * Server so'ralgan filialni RAD ETIB boshqasiga tushishi mumkin:
 * foydalanuvchi filialdan chiqarilgan, filial arxivlangan, markazda
 * yagona filial qolgan yoki localStorage eskirgan. O'qishda bu zararsiz,
 * YOZISHDA esa pul va ma'lumot noto'g'ri filialga tushadi - xatosiz,
 * logsiz, sezilmasdan.
 *
 * `x-branch-context` sarlavhasi shu bo'shliqni yopadi: u SO'ROV emas,
 * TASDIQ. Mos kelmasa 409 va hech narsa yozilmaydi.
 *
 * BAZA KERAK EMAS - sof funksiya tekshiriladi.
 *
 * ISHLATISH:
 *   npm run test:branch-intent
 */
import {
  assertBranchIntent,
  BRANCH_CONTEXT_HEADER,
} from "../src/helpers/branchIntent.guard.js";

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n) => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const check = (n, cond, d = "shart bajarilmadi") => (cond ? ok(n) : bad(n, d));

const grab = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
};

const req = (method, ctx) => ({
  method,
  headers: ctx === null || ctx === undefined ? {} : { [BRANCH_CONTEXT_HEADER]: ctx },
});

const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";

console.log("\n\x1b[1mFILIAL NIYATI TASDIG'I\x1b[0m");

// ── 1) Faqat mutatsiyalar ────────────────────────────────────
console.log("\n\x1b[1m1) Faqat yozish so'rovlari tekshiriladi\x1b[0m");

check(
  "GET tekshirilmaydi (mos kelmasa ham o'tadi)",
  grab(() => assertBranchIntent(req("GET", A), { branchId: B })) === null,
  "o'qishni to'sish foydasiz bezovtalik",
);
check(
  "HEAD tekshirilmaydi",
  grab(() => assertBranchIntent(req("HEAD", A), { branchId: B })) === null,
);

for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
  check(
    `${method} + mos kelmagan filial -> 409`,
    grab(() => assertBranchIntent(req(method, A), { branchId: B }))?.statusCode === 409,
    "YOZUV NOTO'G'RI FILIALGA TUSHARDI",
  );
}

// ── 2) Mos kelgan holat ──────────────────────────────────────
console.log("\n\x1b[1m2) Mos kelganda hech narsa to'silmaydi\x1b[0m");

check(
  "POST + mos kelgan filial -> o'tadi",
  grab(() => assertBranchIntent(req("POST", A), { branchId: A })) === null,
);
check(
  "«Barcha filiallar» ikkala tomonda -> o'tadi",
  grab(() => assertBranchIntent(req("POST", "all"), { branchId: null })) === null,
);

// ── 3) Eng muhim: server boshqasiga tushgan holat ────────────
console.log("\n\x1b[1m3) Server boshqa filialga tushgan holatlar\x1b[0m");

check(
  "client aniq filial kutdi, server «barcha filiallar»ga tushdi -> 409",
  grab(() => assertBranchIntent(req("POST", A), { branchId: null }))?.statusCode === 409,
  "aniq filialga yozmoqchi edi, ko'lam kengayib ketdi",
);
check(
  "client «barcha filiallar» kutdi, server aniq filialga tushdi -> 409",
  grab(() => assertBranchIntent(req("POST", "all"), { branchId: A }))?.statusCode === 409,
  "yagona filialga jimgina tushib qolish - resolveSoleBranchId yo'li",
);

const err = grab(() => assertBranchIntent(req("POST", A), { branchId: B }));
check(
  "409 xabari foydalanuvchiga tushunarli",
  typeof err?.message === "string" && err.message.includes("yangilang"),
  `xabar: ${err?.message}`,
);

// ── 4) Orqaga moslik ─────────────────────────────────────────
console.log("\n\x1b[1m4) Orqaga moslik (sarlavhasiz mijozlar)\x1b[0m");

check(
  "sarlavhasiz POST -> o'tadi",
  grab(() => assertBranchIntent(req("POST", null), { branchId: B })) === null,
  "eski client, bot va tashqi integratsiya buzilmasligi kerak",
);
check(
  "bo'sh sarlavha -> o'tadi",
  grab(() => assertBranchIntent(req("POST", "   "), { branchId: B })) === null,
);
check(
  "scope umuman berilmasa -> o'tadi",
  grab(() => assertBranchIntent(req("POST", "all"), null)) === null,
);

console.log(
  `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
    `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
);
if (R.fail) {
  console.log("\nYiqilganlar:");
  R.notes.forEach((n) => console.log(`  • ${n}`));
  process.exit(1);
}
