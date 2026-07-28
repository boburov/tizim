/**
 * TASDIQ MODELI TESTI (DB'siz - validateSync offline ishlaydi).
 *
 * SAVOL: "Chiqim tasdig'i umumiy tasdiqqa kengaytirilganda moliya
 * hisobotlariga tasdiqlanmagan yozuv sizib kirmaydimi?"
 *
 * Bu modelning uchta himoyasini qulflaydi:
 *   1. kategoriya TURDAN hosila (chaqiruvchi buzib yubora olmaydi);
 *   2. chiqim so'rovi summasiz o'tmaydi (limit tekshiruvining ma'nosi);
 *   3. subyekt qulfi indeksi partial va faqat pending uchun (moliya
 *      so'rovlari qulfga tushib qolmasin).
 *
 * ISHLATISH:
 *   npm run test:approval
 */
import mongoose from "mongoose";
import Approval, {
  APPROVAL_KINDS,
  APPROVAL_CATEGORIES,
  KIND_CATEGORY,
  ALL_APPROVAL_KINDS,
} from "../src/models/approval.model.js";

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
const check = (name, cond, detail = "") => (cond ? ok(name) : bad(name, detail || "shart bajarilmadi"));

const oid = () => new mongoose.Types.ObjectId();
const base = () => ({ branchId: oid(), requestedBy: oid() });

// DIQQAT: validateSync() ATAYLAB ishlatilmaydi - u Mongoose middleware'ni
// O'TKAZIB YUBORADI, ya'ni kategoriyani turdan hosila qiladigan
// pre("validate") hook'i ishlamaydi va test yolg'on xato berardi.
// Bu yerda haqiqiy yozish yo'li (create/save) bilan bir xil async validate
// ishlatiladi.
const validateErr = async (doc) => {
  try {
    await doc.validate();
    return null;
  } catch (err) {
    return err;
  }
};

console.log("\n\x1b[1mTASDIQ MODELI\x1b[0m");

// ── 1. Kategoriya turdan hosila ───────────────────────────────
console.log("\n\x1b[1m1) Kategoriya turdan hosila\x1b[0m");

let d = new Approval({ ...base(), kind: APPROVAL_KINDS.SALARY_PAYMENT, amount: 500_000 });
check(
  "chiqim -> financial",
  (await validateErr(d)) === null && d.category === APPROVAL_CATEGORIES.FINANCIAL,
);

d = new Approval({ ...base(), kind: APPROVAL_KINDS.SALARY_TERMS });
check(
  "maosh sharti -> configuration",
  (await validateErr(d)) === null && d.category === APPROVAL_CATEGORIES.CONFIGURATION,
);

// Eng muhimi: chaqiruvchi noto'g'ri kategoriya yuborsa ham model tuzatadi.
// Aks holda sozlama so'rovi "financial" bo'lib moliya summasiga qo'shilardi.
d = new Approval({
  ...base(),
  kind: APPROVAL_KINDS.SALARY_TERMS,
  category: APPROVAL_CATEGORIES.FINANCIAL,
});
await validateErr(d);
check(
  "qo'lda berilgan NOTO'G'RI kategoriya tuzatiladi",
  d.category === APPROVAL_CATEGORIES.CONFIGURATION,
  `kutildi configuration, keldi ${d.category}`,
);

d = new Approval({ ...base(), kind: "yangi_nomalum_tur", amount: 1 });
check("noma'lum tur rad etiladi", (await validateErr(d)) !== null);

// Har bir tur KIND_CATEGORY xaritasida bormi (yangi tur qo'shilsa eslatadi).
const orphan = ALL_APPROVAL_KINDS.filter((k) => !KIND_CATEGORY[k]);
check("barcha turlar kategoriyaga biriktirilgan", orphan.length === 0, `biriktirilmagan: ${orphan.join(", ")}`);

// ── 2. Summa qoidasi ──────────────────────────────────────────
console.log("\n\x1b[1m2) Summa qoidasi\x1b[0m");

for (const kind of ALL_APPROVAL_KINDS.filter((k) => KIND_CATEGORY[k] === APPROVAL_CATEGORIES.FINANCIAL)) {
  check(`${kind}: summasiz RAD etiladi`, (await validateErr(new Approval({ ...base(), kind }))) !== null);
  check(
    `${kind}: summa bilan o'tadi`,
    (await validateErr(new Approval({ ...base(), kind, amount: 1 }))) === null,
  );
}

for (const kind of ALL_APPROVAL_KINDS.filter((k) => KIND_CATEGORY[k] === APPROVAL_CATEGORIES.CONFIGURATION)) {
  const doc = new Approval({ ...base(), kind });
  const err = await validateErr(doc);
  check(`${kind}: summasiz o'tadi (takrorlanuvchi - limit ma'nosiz)`, err === null, err?.message);
  check(`${kind}: summa null bo'lib qoladi`, doc.amount === null, `keldi ${doc.amount}`);
}

// ── 3. Subyekt qulfi indeksi ──────────────────────────────────
console.log("\n\x1b[1m3) Subyekt qulfi (lost update himoyasi)\x1b[0m");

const idx = Approval.schema.indexes().find(([keys]) => keys.subjectKey === 1);
check("subjectKey indeksi mavjud", !!idx);
check("unique", idx?.[1]?.unique === true);
check(
  "faqat PENDING holatga tegishli",
  idx?.[1]?.partialFilterExpression?.status === "pending",
  "aks holda rad etilgan so'rov ham qulfni ushlab turardi",
);
check(
  "$type: string - subjectKey'siz (moliya) hujjatlar indeksdan tashqarida",
  idx?.[1]?.partialFilterExpression?.subjectKey?.$type === "string",
  "aks holda ketma-ket ikki maosh to'lovi so'rovi bloklanardi",
);

// ── 4. Kolleksiya nomi (migration yo'qligi) ───────────────────
console.log("\n\x1b[1m4) Ma'lumot ko'chirilmaganligi\x1b[0m");
check(
  "jismoniy kolleksiya nomi 'expenseapprovals' bo'lib qoldi",
  Approval.collection.name === "expenseapprovals",
  `keldi: ${Approval.collection.name}`,
);
check(
  "eski yozuvlar uchun kategoriya standarti = financial",
  Approval.schema.path("category").defaultValue === APPROVAL_CATEGORIES.FINANCIAL,
);

// ══════════════════════════════════════════════════════════════
console.log(
  `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} xato\x1b[0m`,
);
if (R.notes.length) {
  console.log("\n\x1b[31mMuammolar:\x1b[0m");
  for (const n of R.notes) console.log(`  • ${n}`);
}
process.exit(R.fail > 0 ? 1 : 0);
