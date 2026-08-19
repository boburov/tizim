/**
 * ══════════════════════════════════════════════════════════════════════
 * XONA BANDLIGI — SOAT DARAJASIDAGI TAHLIL (talab 13, 14, 27)
 * ══════════════════════════════════════════════════════════════════════
 *
 * BU TEST TUTADIGAN XATOLAR (ular ishlab chiqish paytida HAQIQATAN
 * yuz berdi):
 *
 *   1. USTMA-UST YOZUV IKKI BAROBAR SANALARDI. Bitta xonaga bir vaqtda
 *      ikki guruh yozilgan bo'lsa, band vaqt qo'shilib ketardi va
 *      bandlik 100% dan oshardi. To'g'ri javob — oraliqlar BIRLASHMASI:
 *      xona baribir o'sha ikki soat band.
 *
 *   2. SIG'IM 7 KUNGA HISOBLANARDI. Dushanbadan jumagacha TO'LA band
 *      xona 71% ko'rsatardi, ya'ni tizim "joy bor" derdi — aslida
 *      bitta ham bo'sh soat yo'q edi. Endi maxraj FAOL kunlar
 *      (jadvalda dars bo'lgan kunlar) bo'yicha.
 *
 *   3. CHO'QQI QOIDASI HECH QACHON ISHLAMASDI. "Band xonalar 80% dan
 *      ko'p" degan mutlaq chegara uch xonali markazda mumkin emas edi
 *      (2/3 = 66.7%). Endi cho'qqi — markazning O'Z maksimumi.
 *
 * IZOLYATSIYA: test o'z yozuvlarini `ZZTEST` prefiksi bilan yaratadi va
 * `finally` blokida O'CHIRADI — muvaffaqiyatsiz tugasa ham.
 *
 * ISHLATISH:
 *   npm run test:rooms
 */
import prisma from "../src/config/prisma.js";
import { getRoomUtilization } from "../src/modules/branchAnalytics/services/roomUtilization.service.js";

const TAG = "ZZTEST";
const made = { rooms: [], groups: [] };
let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`  XATO ${name} ${extra}`); }
};

const branch = await prisma.branch.findFirst({ where: { isDeleted: false }, select: { id: true } });

const mkRoom = async (name, capacity) => {
  const r = await prisma.room.create({ data: { branchId: branch.id, name: `${TAG} ${name}`, capacity } });
  made.rooms.push(r.id);
  return r;
};
const mkGroup = async (name, roomId, slots) => {
  const g = await prisma.group.create({
    data: {
      branchId: branch.id, name: `${TAG} ${name}`, roomId, isActive: true,
      schedule: { create: slots.map((s) => ({ day: s.d, startTime: s.f, endTime: s.t })) },
    },
  });
  made.groups.push(g.id);
  return g;
};

try {
  const a = await mkRoom("101", 12);   // to'lib ketadigan xona
  const b = await mkRoom("204", 10);   // bo'sh xona

  // 101: dushanba–juma 09:00–21:00 to'liq (12 soat × 5 kun = 60 soat)
  await mkGroup("Toliq", a.id, ["mon","tue","wed","thu","fri"].map((d) => ({ d, f: "09:00", t: "21:00" })));
  // 101 da ATAYLAB to'qnashuv: aynan o'sha vaqtda ikkinchi guruh
  await mkGroup("Toqnashuv", a.id, [{ d: "mon", f: "10:00", t: "12:00" }]);
  // 204: faqat dushanba 2 soat
  await mkGroup("Kam", b.id, [{ d: "mon", f: "18:00", t: "20:00" }]);
  // Xonasiz guruh
  await mkGroup("Xonasiz", null, [{ d: "wed", f: "15:00", t: "17:00" }]);

  const d = await getRoomUtilization({ branchId: branch.id });
  const r101 = d.rooms.find((r) => r.name.endsWith("101"));
  const r204 = d.rooms.find((r) => r.name.endsWith("204"));

  console.log("\n── BANDLIK ──");
  console.log(`  101: ${r101.busyHours} soat / ${r101.capacityHours} = ${r101.utilizationPercent}%`);
  console.log(`  204: ${r204.busyHours} soat = ${r204.utilizationPercent}%`);

  // 60 band soat / 84 sig'im = 71.4%. To'qnashuvchi guruh vaqti QO'SHIMCHA
  // sanaladi (10:00-12:00 allaqachon band edi) — bu ataylab: ikki dars
  // haqiqatan ham yozilgan va ular to'qnashuv sifatida alohida ko'rsatiladi.
  check("101 band soati aynan 60 (ustma-ust yozuv ikki barobar sanalmaydi)", r101.busyHours === 60, `(${r101.busyHours})`);
  check("204 bandligi 2 soat", r204.busyHours === 2, `(${r204.busyHours})`);
  check("sig'im 60 soat (12 soat × 5 faol kun)", r101.capacityHours === 60, `(${r101.capacityHours})`);
  check("faol kunlar dushanba-juma", d.window.activeDays.join(",") === "mon,tue,wed,thu,fri", `(${d.window.activeDays})`);
  check("101 bandligi 100%", r101.utilizationPercent === 100, `(${r101.utilizationPercent})`);

  console.log("\n── TO'QNASHUV ──");
  check("101 da to'qnashuv topildi", r101.conflicts.length === 1, `(${r101.conflicts.length})`);
  check("204 da to'qnashuv yo'q", r204.conflicts.length === 0);
  console.log(`  ${r101.conflicts[0]?.a.name} ⨯ ${r101.conflicts[0]?.b.name} (${r101.conflicts[0]?.day})`);

  console.log("\n── BO'SH OYNA ──");
  const monFree204 = r204.freeWindows.mon.map((w) => `${w.from}-${w.to}`).join(", ");
  console.log(`  204 dushanba bo'sh: ${monFree204}`);
  check("204 dushanba 09:00-18:00 bo'sh", r204.freeWindows.mon.some((w) => w.from === "09:00" && w.to === "18:00"));
  check("101 dushanba bo'sh oyna yo'q", r101.freeWindows.mon.length === 0, `(${r101.freeWindows.mon.length})`);
  check("204 yakshanba to'liq bo'sh", r204.freeWindows.sun.some((w) => w.from === "09:00" && w.to === "21:00"));

  console.log("\n── XONASIZ GURUH ──");
  check("xonasiz guruh aniqlandi", d.unassignedGroups.some((g) => g.name.endsWith("Xonasiz")));
  check("xonasiz guruhning darslari sanaldi", d.unassignedGroups.find((g) => g.name.endsWith("Xonasiz"))?.lessonsPerWeek === 1);

  console.log("\n── TALAB EGRI CHIZIG'I ──");
  const mon18 = d.demand.mon.find((h) => h.hour === 18);
  const mon09 = d.demand.mon.find((h) => h.hour === 9);
  console.log(`  dushanba 18:00 → ${mon18.busyRooms} band / ${mon18.freeRooms} bo'sh (${mon18.loadPercent}%)`);
  console.log(`  dushanba 09:00 → ${mon09.busyRooms} band / ${mon09.freeRooms} bo'sh (${mon09.loadPercent}%)`);
  check("dushanba 18:00 ikki xona band (uchinchisi bo'sh)", mon18.busyRooms === 2 && mon18.freeRooms >= 1);
  check("dushanba 09:00 faqat bitta xona band", mon09.busyRooms === 1 && mon09.freeRooms >= 1);

  console.log("\n── TAVSIYALAR ──");
  for (const rec of d.recommendations) console.log(`  [${rec.kind}] ${rec.text}`);
  check("to'qnashuv tavsiyasi bor", d.recommendations.some((r) => r.kind === "conflict"));
  check("xonasiz guruh tavsiyasi bor", d.recommendations.some((r) => r.kind === "unassigned_group"));
  check("101 to'lib ketgan deb belgilandi", d.recommendations.some((r) => r.kind === "overloaded" && r.roomName.endsWith("101")));
  check("cho'qqida bo'sh xona tavsiyasi bor", d.recommendations.some((r) => r.kind === "free_slot_at_peak"));

  console.log("\n── ISH VAQTI PARAMETRI ──");
  const narrow = await getRoomUtilization({ branchId: branch.id, dayStart: 18, dayEnd: 20 });
  const n204 = narrow.rooms.find((r) => r.name.endsWith("204"));
  console.log(`  18:00-20:00 oynasida 204 bandligi: ${n204.utilizationPercent}%`);
  check("tor oynada 204 bandligi 2/10 = 20% (2 soat × 5 faol kun)", n204.utilizationPercent === 20, `(${n204.utilizationPercent})`);
} finally {
  console.log("\n── TOZALASH ──");
  await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: made.groups } } });
  await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
  await prisma.room.deleteMany({ where: { id: { in: made.rooms } } });
  const left = await prisma.room.count({ where: { name: { startsWith: TAG } } })
    + await prisma.group.count({ where: { name: { startsWith: TAG } } });
  console.log(`  qolgan test yozuvlari: ${left}`);
  console.log(failures === 0 ? "\nNATIJA: hammasi o'tdi" : `\nNATIJA: ${failures} ta xato`);
  process.exit(failures === 0 ? 0 : 1);
}
