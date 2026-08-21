/**
 * AUTH OQIMI — PostgreSQL (Prisma) USTIDA.
 *
 * Bu MongoDB→PostgreSQL migratsiyasining birinchi to'liq ko'chirilgan
 * modulini tekshiradi. U shu bilan birga qolgan modullar uchun NAMUNA:
 * har bir ko'chirilgan servis shu tarzda haqiqiy baza ustida sinalishi kerak.
 *
 * Tekshiriladigan xavflar:
 *
 *   1) PAROL XESHI SIZIB CHIQISHI - Mongoose'da `select: false` bor edi.
 *      Prisma'da uning o'rnini global `omit` egalladi; agar u ishlamasa
 *      passwordHash HAR BIR javobda ketardi.
 *   2) REFRESH TOKEN POYGASI - bitta tokendan ikki marta foydalanish.
 *      Mongo'da buni findOneAndUpdate atomik hal qilardi; Prisma'da
 *      shartli updateMany + count tekshiruvi.
 *   3) `_id` SHARTNOMASI - butun frontend `_id` bo'yicha yozilgan,
 *      Prisma esa `id` qaytaradi.
 *   4) PAROL O'ZGARGACH SESSIYALAR - endi tranzaksiyada; parol yangilanib,
 *      eski sessiya tirik qolmasligi kerak.
 *
 * ISHLATISH:  npm run test:auth-prisma
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as authService from "../src/modules/auth/services/auth.service.js";
import { hashPassword } from "../src/helpers/password.helper.js";

const R = { pass: 0, fail: 0 };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ""}`);
};
const bad = (n, extra = "") => {
  R.fail += 1;
  console.log(`  ❌ ${n}${extra ? ` — ${extra}` : ""}`);
};

const SUFFIX = `t${Date.now().toString(36)}`;
const USERNAME = `authtest_${SUFFIX}`;
const PASSWORD = "Parol12345!";

let userId = null;
let branchId = null;

const cleanup = async () => {
  if (userId) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
};

const run = async () => {
  console.log("\n=== AUTH / PRISMA TESTI ===\n");

  await prisma.$queryRaw`SELECT 1`;

  const branch = await prisma.branch.create({
    data: { name: `Auth test filial ${SUFFIX}` },
  });
  branchId = branch.id;

  const user = await prisma.user.create({
    data: {
      firstName: "Test",
      lastName: "Foydalanuvchi",
      username: USERNAME,
      passwordHash: await hashPassword(PASSWORD),
      role: "owner",
      homeBranchId: branchId,
    },
  });
  userId = user.id;

  // ── 0) ID formati ──
  console.log("0) ID formati (24 belgili hex — klient validatorlari shunga tayanadi)");
  if (/^[0-9a-f]{24}$/.test(user.id)) ok("gen_object_id() to'g'ri format berdi", user.id);
  else bad("ID formati noto'g'ri", user.id);

  // ── 1) passwordHash sizib chiqmasligi ──
  console.log("\n1) passwordHash global `omit` bilan yopilganmi");
  const plain = await prisma.user.findUnique({ where: { id: userId } });
  if (plain && plain.passwordHash === undefined) ok("oddiy so'rovda passwordHash yo'q");
  else bad("passwordHash sizib chiqdi", String(plain?.passwordHash).slice(0, 12));

  const withHash = await prisma.user.findUnique({
    where: { id: userId },
    omit: { passwordHash: false },
  });
  if (withHash?.passwordHash) ok("ochiq so'ralganda passwordHash keladi");
  else bad("ochiq so'ralganda ham passwordHash kelmadi");

  // ── 2) login ──
  console.log("\n2) login");
  const session = await authService.login({
    login: USERNAME,
    password: PASSWORD,
    userAgent: "test",
    ip: "127.0.0.1",
  });
  if (session.accessToken && session.refreshToken) ok("tokenlar berildi");
  else bad("tokenlar berilmadi");

  if (session.user.passwordHash === undefined) ok("javobda passwordHash yo'q");
  else bad("javobda passwordHash bor — XAVFSIZLIK REGRESSIYASI");

  if (session.user._id === userId) ok("`_id` taxallusi saqlandi (frontend shartnomasi)");
  else bad("`_id` yo'q — frontend buziladi", String(session.user._id));

  const fresh = await prisma.user.findUnique({ where: { id: userId } });
  if (fresh.lastLoginAt) ok("lastLoginAt yozildi");
  else bad("lastLoginAt yozilmadi");

  // ── 3) noto'g'ri parol ──
  console.log("\n3) noto'g'ri parol rad etiladimi");
  try {
    await authService.login({ login: USERNAME, password: "notogri", userAgent: "t", ip: "1" });
    bad("noto'g'ri parol o'tib ketdi");
  } catch (err) {
    if (err.statusCode === 401) ok("401 qaytdi");
    else bad("kutilmagan xato", err.message);
  }

  // ── 4) refresh rotatsiyasi ──
  console.log("\n4) refresh token rotatsiyasi");
  const rotated = await authService.rotateRefresh({
    rawRefresh: session.refreshToken,
    userAgent: "test",
    ip: "127.0.0.1",
  });
  if (rotated.accessToken && rotated.refreshToken !== session.refreshToken) {
    ok("yangi juftlik berildi va eskisi almashtirildi");
  } else bad("rotatsiya ishlamadi");

  // ── 5) ESKI tokenni QAYTA ishlatish (poyga himoyasi) ──
  console.log("\n5) ishlatilgan refresh token qayta ishlatilmasligi");
  try {
    await authService.rotateRefresh({
      rawRefresh: session.refreshToken,
      userAgent: "test",
      ip: "127.0.0.1",
    });
    bad("ISHLATILGAN token qayta o'tib ketdi — token qayta ishlatish xavfi");
  } catch (err) {
    if (err.statusCode === 401) ok("qayta ishlatish rad etildi");
    else bad("kutilmagan xato", err.message);
  }

  // ── 6) parallel rotatsiya: faqat BITTASI yutishi kerak ──
  console.log("\n6) parallel rotatsiya — faqat bittasi yutadi");
  const race = await authService.login({
    login: USERNAME, password: PASSWORD, userAgent: "t", ip: "1",
  });
  const results = await Promise.allSettled([
    authService.rotateRefresh({ rawRefresh: race.refreshToken, userAgent: "t", ip: "1" }),
    authService.rotateRefresh({ rawRefresh: race.refreshToken, userAgent: "t", ip: "1" }),
    authService.rotateRefresh({ rawRefresh: race.refreshToken, userAgent: "t", ip: "1" }),
  ]);
  const won = results.filter((r) => r.status === "fulfilled").length;
  if (won === 1) ok("3 ta parallel urinishdan 1 tasi yutdi");
  else bad(`poyga himoyasi buzuq — ${won} ta urinish yutdi (1 bo'lishi kerak)`);

  // ── 7) logout ──
  console.log("\n7) logout");
  const s2 = await authService.login({
    login: USERNAME, password: PASSWORD, userAgent: "t", ip: "1",
  });
  await authService.logout({ rawRefresh: s2.refreshToken });
  try {
    await authService.rotateRefresh({ rawRefresh: s2.refreshToken, userAgent: "t", ip: "1" });
    bad("logout'dan keyin ham token ishladi");
  } catch {
    ok("logout'dan keyin token o'lik");
  }

  // ── 8) parol almashtirish + sessiyalarni yopish (tranzaksiya) ──
  console.log("\n8) parol almashtirilganda barcha sessiyalar yopiladimi");
  const live = await authService.login({
    login: USERNAME, password: PASSWORD, userAgent: "t", ip: "1",
  });
  await authService.changePassword(
    { id: userId },
    { currentPassword: PASSWORD, newPassword: "YangiParol99!" },
  );

  const stillOpen = await prisma.refreshToken.count({
    where: { userId, revokedAt: null },
  });
  if (stillOpen === 0) ok("barcha eski sessiyalar bekor qilindi");
  else bad(`${stillOpen} ta sessiya ochiq qoldi`);

  try {
    await authService.rotateRefresh({ rawRefresh: live.refreshToken, userAgent: "t", ip: "1" });
    bad("eski sessiya parol o'zgargach ham ishladi");
  } catch {
    ok("eski sessiya o'lik");
  }

  const newLogin = await authService.login({
    login: USERNAME, password: "YangiParol99!", userAgent: "t", ip: "1",
  });
  if (newLogin.accessToken) ok("yangi parol bilan kirish ishlaydi");
  else bad("yangi parol bilan kirib bo'lmadi");

  // ── 9) profil yangilash ──
  console.log("\n9) profil yangilash — berilmagan maydonga tegilmasligi");
  const updated = await authService.updateProfile({ id: userId }, { firstName: "Yangi" });
  if (updated.firstName === "Yangi" && updated.lastName === "Foydalanuvchi") {
    ok("faqat berilgan maydon o'zgardi");
  } else bad("boshqa maydon ham o'zgarib ketdi", JSON.stringify(updated));
};

run()
  .catch((err) => {
    R.fail += 1;
    console.error("\nTEST YIQILDI:", err);
  })
  .finally(async () => {
    await cleanup().catch(() => null);
    await prisma.$disconnect();
    console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
    process.exit(R.fail ? 1 : 0);
  });
