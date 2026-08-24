/**
 * ISH MAKONI AUDITI UCHUN SINOV FOYDALANUVCHILARI.
 *
 * ══════════════════════════════════════════════════════════════════════
 * NEGA SEED EMAS, FIXTURE
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu odamlar ISHLAB CHIQARISH bazasida turmasligi kerak: ular
 * ma'lum parolga ega va faqat chegarani sinash uchun mavjud.
 * Shuning uchun ular `src/seeds/` da EMAS — auditdan oldin
 * yaratiladi, keyin `--clean` bilan o'chiriladi.
 *
 * QAMROV: to'rt ish makonining har biri uchun bittadan odam.
 *   qa_admin_a  — A filiali admini (filial darajasidagi vakolat)
 *   qa_admin_b  — B filiali admini (kesishmani sinash uchun)
 *   qa_staff_a  — tor doiradagi xodim (faqat lidlar)
 *   demo_student_1 — o'quvchi (moliya seed'idan)
 *
 * ISHLATISH:
 *   node tests/fixtures/qaUsers.mjs           # yaratish
 *   node tests/fixtures/qaUsers.mjs --clean   # o'chirish
 */
// ⚠ `server_legacy/tests/fixtures/qaUsers.mjs` DAN KO'CHIRILGAN (2026-08-25).
//   Express stek o'chirildi; klient va parol yordamchisi NestJS `dist/`
//   dan olinadi. `createExtendedPrismaClient` ATAYLAB: xom
//   `new PrismaClient()` `passwordHash` niqobini va Decimal→son
//   normalizatsiyasini YO'QOTARDI.
//
// ⚠ BU FIKSTURA 10+ TESTGA KERAK (`qa_admin_a`, `qa_staff_a`, ...).
//   Uni o'chirmang — o'sha testlar JIMGINA `skip` ga tushadi.
import { createExtendedPrismaClient } from "../../dist/prisma/prisma.service.js";
import { hashPassword } from "../../dist/common/utils/password.js";

const prisma = createExtendedPrismaClient();

const CLEAN = process.argv.includes("--clean");

if (CLEAN) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { startsWith: "qa_" } },
        { username: { startsWith: "demo_qa_" } },
      ],
    },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.userBranchAssignment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.role.deleteMany({ where: { value: { startsWith: "qa_" } } });
  console.log(`Tozalandi: ${ids.length} foydalanuvchi + qa_ rollari`);
  process.exit(0);
}

// IKKI FILIAL KERAK: butun auditning ma'nosi A filial admini B
// filialni KO'RA OLMASLIGINI tekshirishda.
//
// ── NEGA NOM BO'YICHA QIDIRILMAYDI ──
// Ilgari bu yerda `name.startsWith("DEMO")` turardi, ya'ni fixture
// moliya demo seed'i ishlatilgan bazaga BOG'LANGAN edi. Boshqa bazada
// `A` `undefined` bo'lib, fixture "Cannot read properties of
// undefined" bilan yiqilardi va sabab ko'rinmasdi.
//
// Endi tartib: asosiy filial → A, boshqa istalgani → B.
const branches = await prisma.branch.findMany({
  where: { isDeleted: false, isActive: true },
  select: { id: true, name: true, isMain: true },
  orderBy: { createdAt: "asc" },
});
if (branches.length < 2) {
  console.error(
    `\nIKKI FILIAL KERAK — hozir ${branches.length} ta.\n` +
    "Filial ochish: panelda Filiallar → Filial qo'shish, yoki\n" +
    "  npm run seed:multi-branch\n",
  );
  process.exit(2);
}
// TARTIB MUHIM: agar moliya demo seed'i ishlatilgan bo'lsa, A —
// AYNAN o'sha filial. Sabab: audit "A admini o'z filialidagilarni
// topadi" degan MUSBAT NAZORATGA tayanadi va u ma'lumotsiz filialda
// bo'sh chiqadi — natijada sizish testi o'z-o'zidan yashil bo'lardi
// va hech narsani isbotlamasdi.
//
// Demo bo'lmasa — asosiy filial (audit HAR QANDAY bazada ishlashi
// kerak; ilgari bu yerda faqat "DEMO" qidirilardi va boshqa bazada
// fixture "Cannot read properties of undefined" bilan yiqilardi).
const A = branches.find((b) => String(b.name).startsWith("DEMO"))
  || branches.find((b) => b.isMain)
  || branches[0];
const B = branches.find((b) => b.id !== A.id);
console.log("A:", A.name, A.id, "| B:", B.name, B.id);

const perms = await prisma.permission.findMany({ select:{id:true,key:true} });
const byKey = new Map(perms.map(p=>[p.key,p.id]));
const pick = (keys) => keys.map(k=>byKey.get(k)).filter(Boolean).map(id=>({id}));

const ADMIN_KEYS = ["admin_dashboard.read","students.read","students.create","students.update",
  "groups.read","groups.create","groups.update","groups.manage_students","attendance.read","attendance.record",
  "teachers.read","users.read","finance.read","finance.pay","finance.view_receivables","branches.read","leads.read",
  // XONA YARATISH — direktorning haqiqiy ishi (talab 11/32).
  // Faqat `classes.read` bo'lsa, "Xona qo'shish" kartasi umuman
  // chizilmaydi va brauzer testi o'sha oqimni JIMGINA o'tkazib
  // yuborardi — ya'ni qoplama bordek ko'rinib, aslida yo'q edi.
  "classes.read","classes.create","classes.update","classes.delete"];
const STAFF_KEYS = ["leads.read","leads.create","leads.update"];

const upsertRole = async (value,label,roleType,keys) =>
  prisma.role.upsert({
    where:{value},
    update:{ permissions:{ set: pick(keys) } },
    create:{ value,label,roleType, defaultPath:"/", isSystem:false, permissions:{ connect: pick(keys) } },
  });

await upsertRole("qa_admin","QA Filial admin","staff",ADMIN_KEYS);
await upsertRole("qa_staff","QA Xodim","staff",STAFF_KEYS);

// ── MOLIYA AUDITI UCHUN TOR ROLLAR ──
// `tests/financeSecurityAudit.mjs` aynan shu uch kesimni sinaydi:
// keng "moliyani ko'rish" huquqi SEZGIR bo'limlarni ochib
// yubormasligini. Ular shu yerda — ikkita audit uchun bitta fixture.
await upsertRole("qa_read", "QA faqat moliya o'qish", "staff", ["finance.read"]);
await upsertRole("qa_profit", "QA foydalilik, maoshsiz", "staff",
  ["finance.read", "finance.view_profitability", "finance.view_cashflow"]);
await upsertRole("qa_acct", "QA faqat hisoblar", "staff",
  ["finance.read", "finance.manage_accounts"]);

// QIDIRUVDAGI TO'LOV BO'LIMI uchun: odamlarni ko'radi, PULNI ko'rmaydi.
// Aynan shu kombinatsiya `finance.read` chegarasini sinaydi —
// `users.read` bo'lgani uchun `/search` ochiq, lekin to'lov qatorlari
// javobda BO'LMASLIGI kerak.
await upsertRole("qa_people", "QA odamlar, pulsiz", "staff",
  ["users.read", "students.read"]);

const pw = await hashPassword("qa123456");
const mkUser = async (username, role, branchId) => {
  const u = await prisma.user.upsert({
    where:{username},
    update:{ role, homeBranchId:branchId, isActive:true, isDeleted:false, passwordHash:pw },
    create:{ username, firstName:"QA", lastName:username, role, homeBranchId:branchId, passwordHash:pw },
  });
  await prisma.userBranchAssignment.deleteMany({ where:{ userId:u.id } });
  await prisma.userBranchAssignment.create({ data:{ userId:u.id, branchId, role } });
  return u;
};
await mkUser("qa_admin_a","qa_admin",A.id);
await mkUser("qa_admin_b","qa_admin",B.id);
await mkUser("qa_staff_a","qa_staff",A.id);
await mkUser("qa_people_a","qa_people",A.id);
// Moliya auditi eski nomlarni kutadi (`demo_qa_*`) — o'sha nomda
// yaratamiz, lekin tozalash `qa_` prefiksi bo'yicha ketadi, shuning
// uchun ular ham `--clean` da o'chadi (pastdagi filtr `qa_` ni
// ISM ICHIDAN emas, boshidan qidiradi — shuning uchun alohida).
await mkUser("demo_qa_read","qa_read",A.id);
await mkUser("demo_qa_profit","qa_profit",A.id);
await mkUser("demo_qa_acct","qa_acct",A.id);
// MOLIYA DEMO O'QUVCHILARI — audit "o'quvchi faqat o'zini ko'radi"
// bo'limida ulardan biri bilan kiradi. Seed ularga parol qo'ymaydi
// (ular UI orqali kirmaydi), shuning uchun uni shu yerda beramiz.
const demoStudents = await prisma.user.updateMany({
  where: { username: { startsWith: "demo_student_" } },
  data: { passwordHash: pw },
});
console.log(`demo o'quvchi paroli o'rnatildi: ${demoStudents.count}`);

console.log(JSON.stringify({A:A.id,B:B.id}));
process.exit(0);
