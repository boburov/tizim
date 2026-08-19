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
import prisma from "../../src/config/prisma.js";
import { hashPassword } from "../../src/helpers/password.helper.js";

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

const branches = await prisma.branch.findMany({ where:{isDeleted:false}, select:{id:true,name:true} });
const A = branches.find(b=>b.name.startsWith("DEMO"));
const B = branches.find(b=>!b.name.startsWith("DEMO"));
console.log("A:", A.name, A.id, "| B:", B.name, B.id);

const perms = await prisma.permission.findMany({ select:{id:true,key:true} });
const byKey = new Map(perms.map(p=>[p.key,p.id]));
const pick = (keys) => keys.map(k=>byKey.get(k)).filter(Boolean).map(id=>({id}));

const ADMIN_KEYS = ["admin_dashboard.read","students.read","students.create","students.update",
  "groups.read","groups.create","groups.update","groups.manage_students","attendance.read","attendance.record",
  "teachers.read","users.read","finance.read","finance.pay","finance.view_receivables","branches.read","classes.read","leads.read"];
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
