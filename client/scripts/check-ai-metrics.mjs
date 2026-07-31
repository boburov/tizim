/**
 * AI KO'RSATKICH MANTIQI TEKSHIRUVI.
 *
 * NEGA BU ALOHIDA SKRIPT: bu yerdagi xato YIQILMAYDI - u shunchaki
 * NOTO'G'RI RANG ko'rsatadi. "Kelmagan +20%" ni YASHIL qilib ko'rsatish
 * owner'ga "yaxshi ketyapti" degan xabar beradi, holbuki davomat
 * buzilgan. Ishonch bilan aytilgan noto'g'ri xabar - eng yomon turdagi
 * xato, chunki uni hech kim tekshirmaydi.
 *
 * Client'da test freymvorki yo'q, shuning uchun `scripts/check-contrast.mjs`
 * naqshiga ergashamiz: oddiy node skripti, nolga teng bo'lmagan exit kod.
 *
 * ALIAS MUAMMOSI: metric.utils.js "@/shared/utils/formatMoney" ni import
 * qiladi, node esa "@/" ni yecha olmaydi. Shuning uchun ikkala manbani
 * BIRLASHTIRIB, data: URL orqali import qilamiz - build quroli kerak emas.
 *
 * ISHLATISH:  npm run check:ai-metrics
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src");

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.failures.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const eq = (n, a, e) => (a === e ? ok(n) : bad(n, `kutilgan "${e}", kelgan "${a}"`));

// ─── Modullarni alias'siz yuklash ───
const load = async () => {
  const money = await readFile(`${SRC}/shared/utils/formatMoney.js`, "utf8");
  const metric = await readFile(
    `${SRC}/owner/features/ai/utils/metric.utils.js`,
    "utf8",
  );
  // formatMoney manbasini oldiga qo'yib, uning import qatorini olib tashlaymiz.
  const merged = `${money}\n${metric.replace(/^import\s+\{[^}]*\}\s+from\s+"@\/[^"]*";?\s*$/m, "")}`;
  return import(`data:text/javascript;base64,${Buffer.from(merged).toString("base64")}`);
};

const GREEN = "text-emerald-600 dark:text-emerald-400";
const RED = "text-rose-600 dark:text-rose-400";
const GREY = "text-muted-foreground";

// Har bir kalit uchun KUTILGAN polyarlik. Bu jadval - AI qatlamining
// "ma'no lug'ati": o'sish yaxshimi yoki yomonmi.
const HIGHER_BETTER = [
  "revenue", "attendance", "studentFlow", "leads", "forecastGross",
  "collectionRate", "lessons", "collected", "net", "cash", "rate",
  "joined", "graduated", "created", "enrolled", "conversion",
  "prevented", "doneByOwner",
];
const LOWER_BETTER = [
  "atRisk", "overdue", "unmarked", "likelyAbsent", "followUps",
  "absent", "left", "complaints", "lateMinutes", "missedLessons",
  "hrAbsences", "affected", "rejected", "occurred", "salaryPaid",
];

const main = async () => {
  console.log("\n\x1b[1m AI KO'RSATKICH MANTIQI\x1b[0m");
  const { deltaTone, formatMetric, formatDelta } = await load();

  // ── 1. POLYARLIK ──
  console.log("\n\x1b[1m1. O'SISH YAXSHIMI YOKI YOMONMI\x1b[0m");

  let wrongUp = 0;
  let wrongDown = 0;
  for (const key of HIGHER_BETTER) {
    if (deltaTone(key, 10) !== GREEN) {
      wrongUp += 1;
      bad(`  "${key}" o'sishi yashil`, deltaTone(key, 10));
    }
    if (deltaTone(key, -10) !== RED) {
      wrongDown += 1;
      bad(`  "${key}" pasayishi qizil`, deltaTone(key, -10));
    }
  }
  eq(`o'sishi yaxshi ${HIGHER_BETTER.length} kalit to'g'ri`, wrongUp + wrongDown, 0);

  let invWrong = 0;
  for (const key of LOWER_BETTER) {
    // ENG MUHIM QATOR: "kelmagan +20%" QIZIL bo'lishi shart.
    if (deltaTone(key, 10) !== RED) {
      invWrong += 1;
      bad(`  "${key}" o'sishi QIZIL bo'lishi kerak`, deltaTone(key, 10));
    }
    if (deltaTone(key, -10) !== GREEN) {
      invWrong += 1;
      bad(`  "${key}" pasayishi yashil`, deltaTone(key, -10));
    }
  }
  eq(`o'sishi yomon ${LOWER_BETTER.length} kalit to'g'ri`, invWrong, 0);

  // Bir kalit ikkala ro'yxatda bo'lib qolmaganmi.
  const overlap = HIGHER_BETTER.filter((k) => LOWER_BETTER.includes(k));
  eq("kalitlar ikkala ro'yxatda takrorlanmaydi", overlap.length, 0);
  if (overlap.length) bad("  takror kalitlar", overlap.join(", "));

  // ── 2. NOMA'LUM KALIT RANGSIZ ──
  console.log("\n\x1b[1m2. NOMA'LUM KALIT NEYTRAL QOLADI\x1b[0m");
  // Hisobotdagi kurs qatorlarida kalit KURS NOMI bo'ladi (dinamik).
  // Taxmin qilib rang berish - noto'g'ri ma'no berish demak.
  eq('"IELTS Advanced" (kurs nomi) rangsiz', deltaTone("IELTS Advanced", 25), GREY);
  eq("noma'lum kalit pasayganda ham rangsiz", deltaTone("qandaydir", -40), GREY);
  eq("delta null bo'lsa rangsiz", deltaTone("revenue", null), GREY);
  eq("delta 0 bo'lsa rangsiz", deltaTone("revenue", 0), GREY);

  // ── 3. QIYMAT FORMATI ──
  console.log("\n\x1b[1m3. QIYMAT FORMATI\x1b[0m");

  // REGRESSIYA: skrinshotda "0 so'm so'm" chiqqan edi. formatMoney()
  // birlikni O'ZI qo'shadi, shuning uchun formatMetric undan keyin
  // yana qo'shmasligi kerak.
  const zero = formatMetric(0, "so'm");
  const occurrences = (zero.match(/so'm/g) || []).length;
  occurrences === 1
    ? ok('"so\'m" bir marta yoziladi', `"${zero}"`)
    : bad('"so\'m" bir marta yoziladi', `"${zero}" — ${occurrences} marta`);

  const big = formatMetric(1250000, "so'm");
  (big.match(/so'm/g) || []).length === 1
    ? ok("katta summada ham bir marta", `"${big}"`)
    : bad("katta summada ham bir marta", `"${big}"`);

  eq("qiymat yo'q bo'lsa chiziqcha", formatMetric(null, "%"), "—");
  eq("undefined ham chiziqcha", formatMetric(undefined, "ta"), "—");
  // 0 — HAQIQIY qiymat, "—" emas. Aks holda "0 ta kechikish" bilan
  // "ma'lumot yo'q" farqlanmay qolardi.
  formatMetric(0, "ta") === "0"
    ? ok("nol qiymat chiziqchaga aylanmaydi")
    : bad("nol qiymat chiziqchaga aylanmaydi", formatMetric(0, "ta"));

  // ── 4. DELTA MATNI ──
  console.log("\n\x1b[1m4. DELTA MATNI\x1b[0m");
  eq("musbat delta", formatDelta(12), "+12%");
  // Tipografik minus (U+2212), defis emas - raqamlar bilan bir tekisda turadi.
  eq("manfiy delta tipografik minus bilan", formatDelta(-8), "−8%");
  eq("nol delta", formatDelta(0), "0%");
  eq("null delta matnsiz", formatDelta(null), null);

  const total = R.pass + R.fail;
  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m ${R.pass}/${total} o'tdi` +
      (R.fail ? `, \x1b[31m${R.fail} yiqildi\x1b[0m` : ", \x1b[32mhammasi joyida\x1b[0m"),
  );
  if (R.failures.length) {
    console.log("\n\x1b[31mYIQILGANLAR:\x1b[0m");
    for (const f of R.failures) console.log(`  • ${f}`);
  }
  process.exit(R.fail ? 1 : 0);
};

main();
