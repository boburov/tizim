/**
 * DIREKTOR ROLI INVARIANTI.
 *
 * SAVOL: "Filial direktori o'z filialida hamma narsani qila oladimi -
 * va SHU BILAN BIRGA o'z ko'lamini kengaytira olmasligiga ishonchim
 * komilmi?"
 *
 * IKKI TOMONLAMA TEKSHIRUV:
 *
 *   (+) BO'LISHI SHART - kundalik filial ishi. Kalit tushib qolsa
 *       direktor jimgina "yarim ishlaydigan" holatga tushadi va buni
 *       faqat u 403 olganda bilib qolamiz (grades.record hikoyasi).
 *
 *   (−) BO'LMASLIGI SHART - imtiyoz oshirish yo'llari. Bittasi ham
 *       o'tib ketsa butun filial izolyatsiyasi ma'nosini yo'qotadi:
 *         branches.view_all      -> boshqa filial ma'lumoti (parollar ham)
 *         branches.update        -> o'ziga qo'yilgan cheklovni o'zi olib tashlaydi
 *         system.admin_access    -> owner-only bo'limlar ochiladi
 *         approvals.decide_config } delegatsiya matritsasini chetlab o'tadi,
 *         finance.approve         } owner huquqni qaytarib ololmaydi
 *
 * MANBA: ro'yxat endi qo'lda yozilmaydi, constants/permissionScope.js
 * dan HISOBLANADI. Shuning uchun test ham seed faylining MATNINI
 * o'qimaydi (ilgari shunday edi va formatlash o'zgarganda buzilardi) -
 * to'g'ridan-to'g'ri hisoblangan ro'yxatni tekshiradi.
 *
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * `mongoose.connect(...)` + `Role.findOne().populate("permissions")`
 * o'rniga `prisma.role.findUnique({ include: { permissions: true } })`.
 *
 * ⚠⚠ VA BITTA JIDDIY XATO TUZATILDI ⚠⚠
 *
 * Eski versiyada 2-bo'lim (JORIY BAZA) `.catch()` ichida edi va xato
 * shunchaki BOSILARDI:
 *
 *     .catch((e) => console.log("~ bazaga ulanib bo'lmadi - faqat shablon"))
 *
 * Natijada Mongoose olib tashlangach test HAR SAFAR "33 to'g'ri / 0 xato"
 * deb YASHIL chiqardi, holbuki bazadagi direktor rolini UMUMAN
 * tekshirmasdi. Ya'ni jonli bazada `system.admin_access` qo'lda berib
 * yuborilgan bo'lsa ham test buni ko'rmasdi — bu aynan testning ASOSIY
 * maqsadi edi.
 *
 * Endi bazaga ulanib bo'lmasa yoki rol topilmasa — bu YIQILISH.
 *
 * BAZAGA YOZMAYDI: faqat o'qiydi, shuning uchun tozalash kerak emas.
 *
 * ISHLATISH:
 *   npm run test:director
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { PERMISSIONS } from "../src/constants/permissions.js";
import {
  BRANCH_LOCAL_PERMISSIONS,
  OWNER_ONLY_PERMISSIONS,
} from "../src/constants/permissionScope.js";

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

// Direktorda BO'LMASLIGI shart - har birining sababi permissionScope.js da.
const FORBIDDEN = OWNER_ONLY_PERMISSIONS;

// Direktorda BO'LISHI kerak bo'lgan kalitlar - kundalik filial ishi.
// Ro'yxat to'liq emas (u BRANCH_LOCAL_PERMISSIONS ning o'zi), bu yerda
// faqat ENG MUHIMLARI sanaladi - ular tushib qolsa filial ishlamaydi.
const REQUIRED = [
  [PERMISSIONS.TEACHERS_CREATE, "xodim qo'shish"],
  [PERMISSIONS.ROLES_UPDATE, "ishga olish route'i talab qiladi"],
  [PERMISSIONS.STUDENTS_CREATE, "o'quvchi qo'shish"],
  [PERMISSIONS.GROUPS_CREATE, "guruh ochish"],
  [PERMISSIONS.GROUPS_UPDATE, "maosh stavkasi belgilash"],
  [PERMISSIONS.FINANCE_MANAGE, "chegirma va guruh narxi"],
  [PERMISSIONS.FINANCE_READ, "moliya ro'yxatlari"],
  [PERMISSIONS.FINANCE_PAY, "to'lov qabul qilish"],
  [PERMISSIONS.EXPENSES_CREATE, "chiqim yozish"],
  [PERMISSIONS.PAYROLL_MANAGE, "xodim maosh shartlari"],
  [PERMISSIONS.SALARY_PAY, "o'qituvchiga maosh to'lash"],
  // Davomat/baho JUFTLIGI. Direktor o'qituvchi kelmagan darsni yopadi -
  // buning uchun ikkalasi ham kerak.
  [PERMISSIONS.ATTENDANCE_RECORD, "davomat belgilash"],
  [PERMISSIONS.GRADES_RECORD, "baho qo'yish"],
  [PERMISSIONS.BRANCHES_READ, "o'z filialini ko'rish"],
  [PERMISSIONS.LEADS_MANAGE, "lidni o'quvchiga aylantirish"],
];

console.log("\n\x1b[1mDIREKTOR ROLI\x1b[0m");

// ── 1. HISOBLANGAN SHABLON (kod bazasi) ───────────────────────
console.log("\n\x1b[1m1) Hisoblangan shablon (permissionScope.js)\x1b[0m");

check(
  "shablon bo'sh emas",
  BRANCH_LOCAL_PERMISSIONS.length > 0,
  "BRANCH_LOCAL_PERMISSIONS bo'sh",
);
check(
  "hamma ruxsat qamrab olingan",
  BRANCH_LOCAL_PERMISSIONS.length + OWNER_ONLY_PERMISSIONS.length ===
    Object.values(PERMISSIONS).length,
  "kalitlar soni mos kelmadi - bir kalit ikkala ro'yxatda yoki hech qaysisida yo'q",
);

for (const key of FORBIDDEN) {
  check(
    `shablonda "${key}" YO'Q`,
    !BRANCH_LOCAL_PERMISSIONS.includes(key),
    "imtiyoz oshirish yo'li ochiq!",
  );
}
for (const [key, why] of REQUIRED) {
  check(
    `shablonda "${key}" bor`,
    BRANCH_LOCAL_PERMISSIONS.includes(key),
    `${why} - ishlamaydi`,
  );
}

// ── 2. JORIY BAZA ─────────────────────────────────────────────
const run = async () => {
  const dbName = String(process.env.DATABASE_URL || "").split("/").pop()?.split("?")[0];
  console.log(`\n\x1b[1m2) Joriy baza (${dbName || "?"})\x1b[0m`);

  const role = await prisma.role.findUnique({
    where: { value: "director" },
    include: { permissions: { select: { key: true } } },
  });

  // ⚠ ROL YO'Q = YIQILISH, "o'tkazib yuborish" EMAS.
  //
  // Ilgari bu shox jimgina `return` qilardi. Direktor roli bu tizimning
  // asosiy filial rolisi — u yo'q bo'lsa yo seed yurgazilmagan, yo rol
  // o'chirib yuborilgan. Ikkalasi ham e'tibor talab qiladi.
  if (!role) {
    bad(
      "direktor roli bazada topildi",
      "rol YO'Q — `npm run seed:permissions` yurgazilmaganmi?",
    );
    return;
  }

  const keys = (role.permissions || []).map((p) => p.key);

  // MUSBAT NAZORAT: rolda ruxsat HAQIQATAN bormi.
  //
  // Busiz bo'sh ro'yxat pastdagi HAMMA "YO'Q" tekshiruvini o'tkazib
  // yuborardi — ya'ni ruxsatsiz rol "mukammal xavfsiz" bo'lib ko'rinardi.
  check(
    "rolda ruxsatlar yuklandi (musbat nazorat)",
    keys.length > 0,
    "ruxsatlar bo'sh — pastdagi «YO'Q» tekshiruvlari ma'nosiz bo'lardi",
  );
  check("rol muzlatilmagan (aks holda kira olmaydi)", role.isFrozen === false);

  for (const key of FORBIDDEN) {
    check(
      `bazada "${key}" YO'Q`,
      !keys.includes(key),
      "qo'lda berib yuborilgan - «npm run migrate:director-full» uni olib tashlaydi",
    );
  }
  for (const [key, why] of REQUIRED) {
    check(
      `bazada "${key}" bor`,
      keys.includes(key),
      `${why} - «npm run migrate:director-full» ni ishga tushiring`,
    );
  }
};

run()
  .catch((e) => {
    // ⚠ JIMGINA O'TKAZIB YUBORISH YO'Q — qarang fayl boshidagi izoh.
    bad("bazaga ulanish", e?.message || String(e));
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} xato\x1b[0m`,
    );
    if (R.notes.length) {
      console.log("\n\x1b[31mMuammolar:\x1b[0m");
      for (const n of R.notes) console.log(`  • ${n}`);
    }
    process.exit(R.fail > 0 ? 1 : 0);
  });
