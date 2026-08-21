/**
 * KURS · XONA · NARX MATRITSASI (Faza 3).
 *
 * UCH SAVOL:
 *
 *   1. XONA filial resursimi? "3-xona" har filialda boshqa xona bo'lishi
 *      SHART, va A filial guruhi B filialning xonasini band qila
 *      olmasligi kerak - aks holda ikkala filialning bandlik hisobi ham
 *      yolg'on chiqadi.
 *
 *   2. NARX MEROSI to'g'ri tartibdami? GroupFee (qo'lda) -> filial
 *      istisnosi -> bazaviy narx. Tartib buzilsa, owner qo'lda kiritgan
 *      istisno katalog narxi bilan jimgina almashib ketardi.
 *
 *   3. NARX TARIXI saqlanadimi? Yangi narx qo'yilganda eskisi
 *      O'CHIRILMAYDI, davri yopiladi - aks holda o'tgan oylarni qayta
 *      hisoblaganda yangi narx ishlatilib, tarix qayta yozilardi.
 *
 * IZOLYATSIYA: o'z test bazasini yaratadi va oxirida O'CHIRADI.
 *
 * ISHLATISH:
 *   npm run test:courses
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Alohida Mongo bazasi + `dropDatabase()` o'rniga prefiksli fixture va
 * kafolatli tozalash (`tests/helpers/prismaFixtures.js`). Xavfsizlik va
 * biznes DA'VOLARI o'zgarmadi — faqat ma'lumotga murojaat qatlami.
 *
 * Bog'lanish maydonlari qayta nomlandi: `teacher` → `teacherId`,
 * `group` → `groupId`, `student` → `studentId` va h.k.
 */
const fx = createFixtures();
let fxCourseId = null;

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const check = (n, cond, d = "shart bajarilmadi") => (cond ? ok(n) : bad(n, d));
const grab = async (fn) => {
  try {
    return { value: await fn(), err: null };
  } catch (err) {
    return { value: null, err };
  }
};

const run = async () => {
  const roomsService = await import("../src/modules/rooms/services/rooms.service.js");
  const priceService = await import(
    "../src/modules/courses/services/coursePrice.service.js"
  );
  const { PRICE_SOURCES } = priceService;
  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );

  const A = await fx.branch("A-filial");
  const B = await fx.branch("B-filial");

  const asBranch = (branchId, fn) =>
    runWithBranchContext(
      {
        branchId: String(branchId),
        allowedBranchIds: [String(branchId)],
        canSeeAllBranches: false,
        userId: null,
      },
      fn,
    );
  const asOwner = (fn) =>
    runWithBranchContext(
      { branchId: null, allowedBranchIds: [], canSeeAllBranches: true, userId: null },
      fn,
    );

  const ielts = await fx.course("IELTS");
  fxCourseId = ielts.id;

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) XONA - filial resursi\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const roomA = await asBranch(A.id, () =>
    roomsService.create({ name: "3-xona", capacity: 12, areaM2: 24 }, null),
  );
  check("A filialda xona yaratildi", String(roomA.branchId) === String(A.id));

  // Bir xil nom BOSHQA filialda - RUXSAT ETILADI.
  const roomB = await asBranch(B.id, () =>
    roomsService.create({ name: "3-xona", capacity: 20 }, null),
  );
  check(
    "«3-xona» B filialda ham yaratiladi (nom filial ichida unikal)",
    String(roomB.branchId) === String(B.id),
    "global unique indeks ikkinchi filialni to'sib qo'ygan bo'lardi",
  );

  // Bir xil nom AYNI filialda - RAD ETILADI.
  const dup = await grab(() =>
    asBranch(A.id, () => roomsService.create({ name: "3-xona" }, null)),
  );
  check(
    "Ayni filialda takror nom rad etiladi",
    dup.err?.statusCode === 409,
    `kutilgan 409, kelgani ${dup.err?.statusCode}`,
  );

  // Ro'yxat FILTRLANADI.
  const listA = await asBranch(A.id, () => roomsService.list({}));
  check(
    "A direktori faqat A xonalarini ko'radi",
    listA.items.length === 1 && String(listA.items[0]._id) === String(roomA.id),
    `${listA.items.length} ta xona qaytdi`,
  );

  const listAll = await asOwner(() => roomsService.list({ limit: 500 }));
  // ⚠ FIXTURE XONALARI bo'yicha: baza bo'sh emas, `items.length === 2`
  // bazadagi boshqa xonalar tufayli hech qachon to'g'ri kelmasdi.
  const fixtureRoomIds = [String(roomA.id), String(roomB.id)];
  const seen = listAll.items
    .map((r) => String(r.id || r._id))
    .filter((id) => fixtureRoomIds.includes(id));
  check(
    "Owner ikkala filial xonasini ko'radi",
    seen.length === 2,
    `${seen.length}/2 fixture xonasi ko'rindi (jami ${listAll.items.length})`,
  );

  // Boshqa filial xonasini ID bilan OCHIB bo'lmaydi.
  const foreign = await grab(() =>
    asBranch(A.id, () => roomsService.getById(String(roomB.id))),
  );
  check(
    "A direktori B xonasini ID bilan ocha olmaydi",
    foreign.err?.statusCode === 403,
    `kutilgan 403, kelgani ${foreign.err?.statusCode}`,
  );

  // Xona filialini ALMASHTIRIB bo'lmaydi.
  const moved = await grab(() =>
    asBranch(A.id, () =>
      roomsService.update(String(roomA.id), { branchId: String(B.id) }),
    ),
  );
  check(
    "Xonaning filialini o'zgartirib bo'lmaydi",
    moved.err?.statusCode === 400,
    "fizik obyekt ko'chmaydi - bandlik tarixi buzilardi",
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) GURUH - xona filialga mos kelishi shart\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // ⚠ `n` FAQAT NOM UCHUN — u Prisma'ga UZATILMASLIGI kerak.
  // Mongoose noma'lum maydonni jimgina tashlardi; Prisma esa
  // "Unknown argument `n`" bilan RAD ETADI.
  const mkGroup = (branchId, { n, ...extra } = {}) =>
    fx.group(`Guruh-${String(branchId).slice(-4)}-${Math.round(n || 1)}`, branchId, {
      // `schedule` endi alohida jadval (Mongo'da embedded massiv edi).
      schedule: { create: [{ day: "mon", startTime: "10:00", endTime: "11:00" }] },
      startDate: new Date("2026-01-01"),
      ...extra,
    });

  const groupA = await mkGroup(A.id, { courseId: ielts.id, roomId: roomA.id });
  check("A guruhga A xonasi biriktirildi", String(groupA.roomId) === String(roomA.id));

  const groupsService = await import("../src/modules/groups/services/groups.service.js");
  const crossRoom = await grab(() =>
    asBranch(A.id, () =>
      groupsService.update(String(groupA.id), { roomId: String(roomB.id) }),
    ),
  );
  check(
    "A guruhga B filialning xonasini biriktirib bo'lmaydi",
    crossRoom.err?.statusCode === 400,
    "aks holda ikkala filialning bandlik hisobi ham yolg'on chiqardi",
  );

  // Xonada faol guruh bo'lsa - o'chirib bo'lmaydi.
  const busyDelete = await grab(() =>
    asBranch(A.id, () => roomsService.softRemove(String(roomA.id), null)),
  );
  check(
    "Faol guruhi bor xonani o'chirib bo'lmaydi",
    busyDelete.err?.statusCode === 400,
    "guruh «xonasiz» qolib jadvaldan yo'qolardi",
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) NARX MEROSI - yechim tartibi\x1b[0m");
  // ─────────────────────────────────────────────────────────

  // Narx umuman yo'q.
  let price = await priceService.resolveGroupPrice(String(groupA.id));
  check(
    "Narx yo'q -> source=none",
    price.source === PRICE_SOURCES.NONE && price.amount === null,
    `source=${price.source}`,
  );

  // Bazaviy narx.
  await asOwner(() =>
    priceService.setPrice(
      { courseId: String(ielts.id), branchId: null, amount: 500000 },
      null,
    ),
  );
  price = await priceService.resolveGroupPrice(String(groupA.id));
  check(
    "Bazaviy narx qo'llanadi",
    price.source === PRICE_SOURCES.BASE_PRICE && price.amount === 500000,
    `source=${price.source}, amount=${price.amount}`,
  );

  // Filial istisnosi bazaviydan USTUN.
  await asBranch(A.id, () =>
    priceService.setPrice(
      { courseId: String(ielts.id), branchId: String(A.id), amount: 700000 },
      null,
    ),
  );
  price = await priceService.resolveGroupPrice(String(groupA.id));
  check(
    "Filial istisnosi bazaviydan USTUN",
    price.source === PRICE_SOURCES.BRANCH_PRICE && price.amount === 700000,
    `source=${price.source}, amount=${price.amount}`,
  );

  // B filialning guruhi baribir BAZAVIY narxda.
  const groupB = await mkGroup(B.id, { courseId: ielts.id, n: 2 });
  const priceB = await priceService.resolveGroupPrice(String(groupB.id));
  check(
    "Boshqa filial bazaviy narxda qoladi",
    priceB.source === PRICE_SOURCES.BASE_PRICE && priceB.amount === 500000,
    `source=${priceB.source}, amount=${priceB.amount}`,
  );

  // GroupFee HAMMASIDAN USTUN.
  await fx.groupFee(groupA.id, 2026, 8, 400000);
  price = await priceService.resolveGroupPrice(String(groupA.id), {
    year: 2026,
    month: 8,
  });
  check(
    "Guruhga qo'lda qo'yilgan narx HAMMASIDAN ustun",
    price.source === PRICE_SOURCES.GROUP_FEE && price.amount === 400000,
    `source=${price.source}, amount=${price.amount}`,
  );

  // Kursi yo'q guruh - meros yo'q.
  const noCourse = await mkGroup(A.id, { n: 3 });
  const noPrice = await priceService.resolveGroupPrice(String(noCourse.id));
  check(
    "Kursi biriktirilmagan guruhda meros yo'q",
    noPrice.source === PRICE_SOURCES.NONE,
    `source=${noPrice.source}`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) NARX TARIXI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const before = await prisma.coursePrice.count({ where: { courseId: ielts.id } });

  // Narxni ko'taramiz - kelasi oydan.
  const future = new Date(Date.UTC(2026, 10, 1)); // 2026-11-01
  await asOwner(() =>
    priceService.setPrice(
      { courseId: String(ielts.id), branchId: null, amount: 600000, validFrom: future },
      null,
    ),
  );
  const after = await prisma.coursePrice.count({ where: { courseId: ielts.id } });

  check(
    "Yangi narx QATOR qo'shadi (eskisi o'chirilmaydi)",
    after === before + 1,
    `${before} -> ${after}`,
  );

  const closed = await prisma.coursePrice.findFirst({
    where: { courseId: ielts.id, branchId: null, amount: 500000 },
  });
  check(
    "Eski narxning davri YOPILDI",
    closed?.validTo !== null,
    "validTo null qolsa ikkita ochiq narx bo'lardi",
  );

  // O'TGAN oyni hisoblaganda ESKI narx.
  const past = await priceService.resolveGroupPrice(String(groupB.id), {
    year: 2026,
    month: 9,
  });
  check(
    "O'tgan oy uchun ESKI narx ishlatiladi",
    past.amount === 500000,
    `amount=${past.amount} — tarix qayta yozilgan`,
  );

  // KELAJAK oyni hisoblaganda YANGI narx.
  const later = await priceService.resolveGroupPrice(String(groupB.id), {
    year: 2026,
    month: 12,
  });
  check(
    "Kelajak oy uchun YANGI narx ishlatiladi",
    later.amount === 600000,
    `amount=${later.amount}`,
  );

  // Bir xil summa qayta yuborilsa - yangi qator OCHILMAYDI.
  const countBefore = await prisma.coursePrice.count({ where: { courseId: ielts.id } });
  await asOwner(() =>
    priceService.setPrice(
      { courseId: String(ielts.id), branchId: null, amount: 600000 },
      null,
    ),
  );
  const countAfter = await prisma.coursePrice.count({ where: { courseId: ielts.id } });
  check(
    "Bir xil summa qayta yuborilsa yangi qator ochilmaydi",
    countBefore === countAfter,
    `${countBefore} -> ${countAfter}`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) NARX - filial chegarasi\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const foreignPrice = await grab(() =>
    asBranch(A.id, () =>
      priceService.setPrice(
        { courseId: String(ielts.id), branchId: String(B.id), amount: 1 },
        null,
      ),
    ),
  );
  check(
    "A direktori B filialga narx belgilay olmaydi",
    foreignPrice.err?.statusCode === 403,
    `kutilgan 403, kelgani ${foreignPrice.err?.statusCode}`,
  );

  const matrixA = await asBranch(A.id, () =>
    priceService.listForCourse(String(ielts.id)),
  );
  check(
    "A direktori matritsada faqat O'Z istisnosini ko'radi",
    matrixA.branches.length === 1 &&
      String(matrixA.branches[0].branchId.id) === String(A.id),
    `${matrixA.branches.length} ta filial qatori`,
  );
  check("Bazaviy narx hammaga ko'rinadi", matrixA.base?.amount === 600000);
  check(
    "Kelajakdagi narx `isPending` bilan belgilanadi",
    matrixA.base?.isPending === true,
    "bayroqsiz owner matritsada 600 000 ni ko'rib, hisobotda 500 000 ni topardi",
  );

  const cleared = await grab(() =>
    asBranch(A.id, () =>
      priceService.clearBranchPrice(String(ielts.id), String(A.id), null),
    ),
  );
  check("Filial istisnosi olib tashlanadi", cleared.err === null);

  price = await priceService.resolveGroupPrice(String(groupA.id));
  check(
    "Istisno olingach BAZAVIY narxga qaytadi",
    price.source === PRICE_SOURCES.BASE_PRICE,
    `source=${price.source}`,
  );
  // DIQQAT - 600 000 EMAS, 500 000 kutiladi.
  //
  // Yangi bazaviy narx `validFrom: 2026-11-01` bilan qo'yilgan, ya'ni
  // BUGUN hali amalda emas. Resolver "hozir amalda bo'lgan" narxni
  // qaytaradi - agar u 600 000 bersa, kelajakdagi narx bugungi
  // hisob-kitobga kirib ketgan bo'lardi.
  check(
    "Kelajakdagi narx BUGUNGI hisobga kirmaydi",
    price.amount === 500000,
    `amount=${price.amount} — kelajak narxi bugunga qo'llangan`,
  );

  const clearBase = await grab(() =>
    asOwner(() => priceService.clearBranchPrice(String(ielts.id), null, null)),
  );
  check(
    "Bazaviy narxni o'chirib bo'lmaydi",
    clearBase.err?.statusCode === 400,
    "u yagona zaxira - o'chirilsa narx umuman topilmasdi",
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m6) NARX MEROSI HISOB-KITOBGA TA'SIR QILADIMI\x1b[0m");
  // ─────────────────────────────────────────────────────────
  //
  // Eng muhim tekshiruv: matritsa qurilgan-u, uni hech kim
  // CHAQIRMASA, kurs narxi hech qachon hisob-kitobga ta'sir
  // qilmasdi va butun Faza 3 bezak bo'lib qolardi.

  const feeService = await import(
    "../src/modules/finance/services/groupFee.service.js"
  );

  // Bazaviy narx hozir 600 000 (yuqorida qo'yilgan, 2026-11 dan).
  // Kelajak oy uchun GroupFee yaratsak - u kurs narxini MEROS olishi kerak.
  const freshGroup = await mkGroup(B.id, { courseId: ielts.id, n: 9 });
  const fee = await feeService.ensureGroupFee(freshGroup.id, 2026, 12);

  check(
    "Yangi guruh tarifi KURS narxidan meros oldi",
    fee.amount === 600000,
    `tarif: ${fee.amount} — matritsa hisob-kitobga ulanmagan bo'lardi`,
  );

  // Kursi YO'Q guruhda meros ham yo'q - avvalgidek 0.
  const noCourseGroup = await mkGroup(B.id, { n: 10 });
  const fee0 = await feeService.ensureGroupFee(noCourseGroup.id, 2026, 12);
  check(
    "Kursi yo'q guruhda tarif 0 (avvalgidek)",
    fee0.amount === 0,
    `tarif: ${fee0.amount}`,
  );

  // O'TGAN OY tarifi KURS narxidan USTUN.
  await fx.groupFee(freshGroup.id, 2027, 1, 111111);
  const feeNext = await feeService.ensureGroupFee(freshGroup.id, 2027, 2);
  check(
    "O'tgan oy tarifi kurs narxidan USTUN",
    feeNext.amount === 111111,
    `tarif: ${feeNext.amount} — guruhga qo'lda qo'yilgan qaror muhimroq`,
  );

  // ── Yakun ──
};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    // Servis yaratgan narx va tarif qatorlarini ham tozalaymiz.
    // Servis yaratgan xonalarni ham reyestrga olamiz — aks holda
    // `rooms_branchId_fkey` filialni o'chirishga yo'l bermaydi.
    const bids = [...(fx.registry.get("branch") || [])];
    const rooms = await prisma.room
      .findMany({ where: { branchId: { in: bids } }, select: { id: true } })
      .catch(() => []);
    for (const r of rooms) fx.track("room", r.id);

    const prices = await prisma.coursePrice
      .findMany({ where: { courseId: fxCourseId || "" }, select: { id: true } })
      .catch(() => []);
    for (const r of prices) fx.track("coursePrice", r.id);
    const gids = [...(fx.registry.get("group") || [])];
    const fees = await prisma.groupFee
      .findMany({ where: { groupId: { in: gids } }, select: { id: true } })
      .catch(() => []);
    for (const r of fees) fx.track("groupFee", r.id);

    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
        `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
    );
    if (R.fail) R.notes.forEach((n) => console.log(`  • ${n}`));
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
