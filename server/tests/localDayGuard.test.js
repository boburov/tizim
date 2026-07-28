/**
 * MAHALLIY KUN QO'RIQLOVI TESTI (timezone regressiyasi).
 *
 * MUAMMO: mahalliy soat 00:00-05:00 oralig'ida o'quvchi/o'qituvchi yaratib
 * bo'lmasdi - "Ro'yxatga olingan sana kelajakda bo'lmasin" xatosi chiqardi.
 *
 * SABAB: client "2026-07-28" (Asia/Tashkent kuni) yuboradi, JS uni UTC yarim
 * tuni deb parse qiladi (2026-07-28T00:00:00Z), keyin u `Date.now()` bilan
 * solishtiriladi. Toshkentda 00:30 da `Date.now()` = 2026-07-27T19:30Z, ya'ni
 * bugungi sana "kelajak" bo'lib chiqadi. UTC+5 → oyna aynan 5 soat.
 *
 * Bu test soatni 00:00-05:00 oynasiga qotirib, ikkala qatlamni ham tekshiradi:
 * helper (isFutureLocalDay) va haqiqiy Zod validatori. DB kerak emas.
 *
 * ISHLATISH:
 *   npm run test:localday
 */
import {
  isFutureLocalDay,
  localTodayMidnight,
  parseLocalDay,
} from "../src/helpers/attendance.helper.js";
import { registerUserSchema } from "../src/modules/auth/validators/registerUser.validator.js";

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

// ─── Soatni qotirish (sinon kerak emas) ───
const RealDate = Date;
const freezeClock = (iso) => {
  const fixed = new RealDate(iso).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  };
  return () => {
    globalThis.Date = RealDate;
  };
};

// Toshkent (UTC+5) mahalliy vaqtini UTC instantga aylantiradi.
const tashkent = (dayKey, hh, mm = 0) => {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new RealDate(RealDate.UTC(y, m - 1, d, hh - 5, mm, 0, 0)).toISOString();
};

const studentBody = (enrolledAt) => ({
  body: {
    firstName: "Ali",
    lastName: "Valiyev",
    username: "alivaliyev",
    password: "parol123",
    role: "student",
    enrolledAt,
  },
});

const teacherBody = (hiredAt) => ({
  body: {
    firstName: "Dilnoza",
    lastName: "Karimova",
    username: "dilnozak",
    password: "parol123",
    role: "teacher",
    hiredAt,
  },
});

const run = () => {
  const TODAY = "2026-07-28";
  const TOMORROW = "2026-07-29";

  // ─── 1. Buzuq oyna: mahalliy 00:00-04:59 ───
  console.log("\n\x1b[1m1) Buzuq oyna (mahalliy 00:00-04:59)\x1b[0m");
  for (const [hh, mm] of [
    [0, 0],
    [0, 30],
    [2, 0],
    [3, 0],
    [4, 59],
  ]) {
    const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const restore = freezeClock(tashkent(TODAY, hh, mm));
    try {
      if (isFutureLocalDay(TODAY)) {
        bad(`${label} — bugungi sana kelajak emas`, "helper hali ham rad etyapti");
      } else {
        ok(`${label} — helper bugungi sanani qabul qildi`);
      }

      const res = registerUserSchema.safeParse(studentBody(TODAY));
      if (res.success) ok(`${label} — o'quvchi yaratildi (validator)`);
      else bad(`${label} — o'quvchi yaratildi (validator)`, res.error.issues[0].message);

      const tRes = registerUserSchema.safeParse(teacherBody(TODAY));
      if (tRes.success) ok(`${label} — o'qituvchi yaratildi (validator)`);
      else bad(`${label} — o'qituvchi yaratildi (validator)`, tRes.error.issues[0].message);
    } finally {
      restore();
    }
  }

  // ─── 2. Oynadan tashqari (regressiya bo'lmasin) ───
  console.log("\n\x1b[1m2) Oynadan tashqari (kunduzi)\x1b[0m");
  for (const hh of [5, 12, 23]) {
    const label = `${String(hh).padStart(2, "0")}:00`;
    const restore = freezeClock(tashkent(TODAY, hh));
    try {
      const res = registerUserSchema.safeParse(studentBody(TODAY));
      if (res.success) ok(`${label} — bugungi sana qabul qilindi`);
      else bad(`${label} — bugungi sana qabul qilindi`, res.error.issues[0].message);
    } finally {
      restore();
    }
  }

  // ─── 3. HAQIQIY kelajak hali ham rad etilsin ───
  console.log("\n\x1b[1m3) Haqiqiy kelajak rad etiladi\x1b[0m");
  for (const [hh, mm] of [
    [0, 30],
    [4, 59],
    [12, 0],
  ]) {
    const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const restore = freezeClock(tashkent(TODAY, hh, mm));
    try {
      if (isFutureLocalDay(TOMORROW)) ok(`${label} — ertangi sana kelajak deb topildi`);
      else bad(`${label} — ertangi sana kelajak deb topildi`, "qo'riqlov o'tkazib yubordi");

      const res = registerUserSchema.safeParse(studentBody(TOMORROW));
      if (!res.success) ok(`${label} — ertangi sana rad etildi (validator)`);
      else bad(`${label} — ertangi sana rad etildi (validator)`, "qabul qilindi!");
    } finally {
      restore();
    }
  }

  // ─── 4. O'tmish va normalizatsiya ───
  console.log("\n\x1b[1m4) O'tmish sanasi va normalizatsiya\x1b[0m");
  const restore = freezeClock(tashkent(TODAY, 0, 30));
  try {
    const past = registerUserSchema.safeParse(studentBody("2020-01-15"));
    if (past.success) ok("o'tmish sanasi qabul qilindi");
    else bad("o'tmish sanasi qabul qilindi", past.error.issues[0].message);

    const norm = parseLocalDay(TODAY);
    if (norm.toISOString() === "2026-07-28T00:00:00.000Z")
      ok("parseLocalDay UTC-midnight qaytardi", norm.toISOString());
    else bad("parseLocalDay UTC-midnight qaytardi", norm.toISOString());

    // Idempotent: Date obyektini qayta berish kunni surmasligi kerak.
    if (parseLocalDay(norm).getTime() === norm.getTime()) ok("parseLocalDay idempotent");
    else bad("parseLocalDay idempotent", "kun surildi");

    // 00:30 da "bugun" mahalliy 28-kun bo'lishi kerak (UTC bo'yicha 27 emas).
    const today = localTodayMidnight();
    if (today.toISOString() === "2026-07-28T00:00:00.000Z")
      ok("localTodayMidnight mahalliy kunni berdi", today.toISOString());
    else bad("localTodayMidnight mahalliy kunni berdi", today.toISOString());

    // Yaroqsiz sana kelajak deb hisoblanmasin (alohida xato beriladi).
    if (isFutureLocalDay("2026-02-31") === false) ok("yaroqsiz sana kelajak deb belgilanmadi");
    else bad("yaroqsiz sana kelajak deb belgilanmadi", "true qaytardi");
  } finally {
    restore();
  }

  console.log(
    `\n\x1b[1mNatija:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.fail) {
    R.notes.forEach((n) => console.log(`  - ${n}`));
    process.exit(1);
  }
};

run();
