/**
 * DIREKTOR ROLI INVARIANTI.
 *
 * SAVOL: "Direktor o'z so'rovini o'zi tasdiqlay olmasligiga ishonchim komilmi?"
 *
 * Butun tasdiq zanjiri BITTA shartga tayanadi: direktorda tasdiqlash kaliti
 * BO'LMASLIGI. Kimdir matritsada beparvo "hammasini belgilash" bosib qo'ysa
 * yoki seed shabloniga kalit qo'shib yuborsa - tizim jimgina ma'nosini
 * yo'qotadi (hech qanday xato chiqmaydi, so'rovlar shunchaki darhol
 * bajarilaveradi).
 *
 * Bu test ikkalasini ham tekshiradi:
 *   1. SEED SHABLONI  - kod bazasidagi ro'yxat (DB'siz);
 *   2. JORIY BAZA     - haqiqatda saqlangan rol (ulanish bo'lsa).
 *
 * ISHLATISH:
 *   npm run test:director
 */
import "dotenv/config";
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { PERMISSIONS } from "../src/constants/permissions.js";

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → ${d}`);
};
const check = (n, cond, d = "") => (cond ? ok(n) : bad(n, d || "shart bajarilmadi"));

// Direktorda BO'LMASLIGI shart bo'lgan kalitlar.
const FORBIDDEN = [PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.APPROVALS_DECIDE_CONFIG];

// Direktorda BO'LISHI kerak bo'lgan kalitlar - ular bo'lmasa u so'rovni
// BOSHLAY olmaydi va tasdiq zanjiri umuman ishga tushmaydi.
const REQUIRED = [
  [PERMISSIONS.GROUPS_UPDATE, "maosh stavkasi so'rash"],
  [PERMISSIONS.FINANCE_MANAGE, "chegirma so'rash"],
  [PERMISSIONS.TEACHERS_CREATE, "ishga olish so'rash"],
  [PERMISSIONS.ROLES_UPDATE, "ishga olish route'i talab qiladi"],
  [PERMISSIONS.FINANCE_READ, "tasdiqlar ro'yxatini ko'rish"],
  // Davomat/baho JUFTLIGI. Direktor o'qituvchi kelmagan darsni yopadi -
  // buning uchun ikkalasi ham kerak. Ilgari GRADES_RECORD tushib qolgan
  // edi: davomat belgilanardi, baho esa 403 berardi.
  [PERMISSIONS.ATTENDANCE_RECORD, "davomat belgilash"],
  [PERMISSIONS.GRADES_RECORD, "baho qo'yish"],
];

console.log("\n\x1b[1mDIREKTOR ROLI\x1b[0m");

// ── 1. SEED SHABLONI (kod bazasi) ─────────────────────────────
console.log("\n\x1b[1m1) Seed shabloni (kod)\x1b[0m");

const seedSrc = readFileSync(new URL("../src/seeds/permissions.seed.js", import.meta.url), "utf8");
const block = seedSrc.slice(
  seedSrc.indexOf("const directorPermKeys = ["),
  seedSrc.indexOf("const directorPermIds"),
);
// "PERMISSIONS.FOO" -> haqiqiy kalit qiymati.
const seedKeys = [...block.matchAll(/PERMISSIONS\.([A-Z_]+)/g)]
  .map((m) => PERMISSIONS[m[1]])
  .filter(Boolean);

check("shablon o'qildi", seedKeys.length > 0, "directorPermKeys topilmadi");
for (const key of FORBIDDEN) {
  check(
    `shabloncha "${key}" YO'Q`,
    !seedKeys.includes(key),
    "direktor o'z so'rovini o'zi tasdiqlay oladigan bo'lib qoladi!",
  );
}
for (const [key, why] of REQUIRED) {
  check(`shablonda "${key}" bor`, seedKeys.includes(key), `${why} - ishlamaydi`);
}

// ── 2. JORIY BAZA ─────────────────────────────────────────────
const run = async () => {
  await mongoose.connect(process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina");
  console.log(`\n\x1b[1m2) Joriy baza (${mongoose.connection.name})\x1b[0m`);

  const Role = (await import("../src/models/role.model.js")).default;
  const role = await Role.findOne({ value: "director" }).populate("permissions").lean();

  if (!role) {
    console.log("  \x1b[2m~ direktor roli bazada yo'q - o'tkazib yuborildi\x1b[0m");
    return;
  }

  const keys = (role.permissions || []).map((p) => p.key);
  check("rol muzlatilmagan (aks holda kira olmaydi)", role.isFrozen === false);
  for (const key of FORBIDDEN) {
    check(
      `bazada "${key}" YO'Q`,
      !keys.includes(key),
      "matritsada qo'lda berib yuborilgan - tasdiq zanjiri buzilgan!",
    );
  }
  for (const [key, why] of REQUIRED) {
    check(`bazada "${key}" bor`, keys.includes(key), `${why} - ishlamaydi`);
  }
};

run()
  .catch((e) => {
    console.log(`\n  \x1b[2m~ bazaga ulanib bo'lmadi (${e?.message}) - faqat shablon tekshirildi\x1b[0m`);
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} xato\x1b[0m`,
    );
    if (R.notes.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      for (const n of R.notes) console.log(`  • ${n}`);
    }
    process.exit(R.fail > 0 ? 1 : 0);
  });
