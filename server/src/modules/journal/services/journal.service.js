import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import {
  ACCOUNT_KINDS,
  TREASURY_KINDS,
  INTER_BRANCH_KINDS,
  ENTRY_KINDS,
  signedBalance,
} from "../../../constants/ledger.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";

// JURNAL (qo'sh yozuv) - yozish va o'qishning YAGONA nuqtasi.
//
// ── MODUL NOMI HAQIDA ──
// Bu `modules/ledger` DAN BOSHQA narsa. U yerdagi "ledger" - o'quvchi va
// xodimning SHAXSIY hisobvarag'i (o'qish modeli, hech narsa yozmaydi).
// Bu yerdagi "journal" esa MARKAZNING KASSA jurnali: qaysi kassada
// qancha pul bor va u qayerdan kelib qayerga ketdi.
//
// Boshqa modullar JournalEntry'ni TO'G'RIDAN-TO'G'RI yozmasligi kerak:
// hisob topish, muvozanat va elimination bayrog'i shu yerda hal qilinadi.
// Chetlab o'tilgan bitta yozuv butun jurnalni nomuvozanat qilib qo'yadi.
//
// ═════════════════════════════════════════════════════════════════
// MONGO → PRISMA: IKKI TUB O'ZGARISH
//
// 1) QATORLAR (lines) EMBEDDED EMAS, ALOHIDA JADVAL (JournalLine).
//    Yozuv va uning qatorlari endi ichma-ich `create` bilan BITTA
//    amalda yoziladi, ya'ni "sarlavhasi bor, qatorlari yo'q" yozuv
//    hosil bo'lishi mumkin emas.
//
// 2) MUVOZANAT INVARIANTI KODDA. Mongoose `pre("save")` hook'i
//    debet/kredit yig'indisini hisoblab, teng emasligini rad etardi.
//    Prisma'da hook YO'Q - shuning uchun tekshiruv `post()` ichiga
//    OCHIQ ko'chirildi. Uni olib tashlash butun jurnalni jimgina
//    nomuvozanat qilib qo'yardi.
//
// AGGREGATE'lar `$unwind` o'rniga JournalLine ustidan `groupBy` bilan
// bajariladi. Filial esa ACCOUNT dan olinadi: har hisob aynan bitta
// filialga tegishli (`Account.branchId`) va `post()` faqat o'sha
// filialning hisoblarini ishlatadi - ya'ni natija bir xil, lekin
// qo'shimcha join shart emas.
// ═════════════════════════════════════════════════════════════════

/**
 * Hisobni topadi yoki YARATADI.
 *
 * Talab bo'yicha yaratish (lazy): oldindan har filialga 12 turdagi hisob
 * ochish shovqin bo'lardi va ko'pi hech qachon ishlatilmasdi.
 *
 * POYGA HIMOYASI: ikki so'rov bir vaqtda bir xil hisobni yaratsa, qisman
 * unique indeks ikkinchisini rad etadi (P2002) - u holda mavjudini o'qiymiz.
 */
export const ensureAccount = async (branchId, kind, counterpartyBranchId = null, tx) => {
  const client = tx || prisma;
  const bid = String(branchId);
  const cp = counterpartyBranchId ? String(counterpartyBranchId) : null;
  const query = { branchId: bid, kind, counterpartyBranchId: cp };

  const existing = await client.account.findFirst({ where: query });
  if (existing) return existing;

  // ═══════════════════════════════════════════════════════════════════
  // POYGA: `catch (P2002)` TRANZAKSIYA ICHIDA ISHLAMAYDI
  // ═══════════════════════════════════════════════════════════════════
  //
  // Ilgari bu yerda `create()` va to'qnashuvda `catch (P2002) → qayta
  // o'qish` turardi. Tranzaksiyadan tashqarida bu to'g'ri, ICHIDA esa
  // yo'q: PostgreSQL'da tranzaksiya ichidagi xato butun tranzaksiyani
  // ABORT qiladi va `catch` ichidagi qayta o'qish ham yiqiladi.
  //
  // Bu STEP 4 dan keyin real xavfga aylandi: endi to'lov, chiqim va
  // maosh BITTA tranzaksiyada yoziladi, hisoblar esa TALAB BO'YICHA
  // yaratiladi. Ya'ni filialdagi ENG BIRINCHI parallel to'lovlar
  // aynan shu yerda to'qnashardi.
  //
  // `ON CONFLICT DO NOTHING` xato CHIQARMAYDI — tranzaksiya sog'lom
  // qoladi. Qisman (partial) unique indeks bo'lgani uchun `WHERE`
  // sharti indeksdagi bilan AYNAN bir xil yozilishi shart, aks holda
  // Postgres indeksni taniy olmaydi.
  // Qarang: migrations/20260815200910_partial_unique_indexes.
  if (cp) {
    await client.$executeRaw`
      INSERT INTO "accounts" ("branchId", "kind", "counterpartyBranchId", "createdAt", "updatedAt")
      VALUES (${bid}, ${kind}::"AccountKind", ${cp}, NOW(), NOW())
      ON CONFLICT ("branchId", "kind", "counterpartyBranchId")
        WHERE "counterpartyBranchId" IS NOT NULL
        DO NOTHING
    `;
  } else {
    await client.$executeRaw`
      INSERT INTO "accounts" ("branchId", "kind", "createdAt", "updatedAt")
      VALUES (${bid}, ${kind}::"AccountKind", NOW(), NOW())
      ON CONFLICT ("branchId", "kind")
        WHERE "counterpartyBranchId" IS NULL
        DO NOTHING
    `;
  }

  const account = await client.account.findFirst({ where: query });
  if (!account) throw new ApiError(500, `Hisob yaratilmadi: ${kind}`);
  return account;
};

/**
 * JURNALGA YOZADI.
 *
 * `lines` da hisob TURI beriladi, ID emas - chaqiruvchi hisob topish
 * bilan shug'ullanmasin:
 *
 *   post({
 *     branchId, kind: "payment", memo: "To'lov",
 *     lines: [
 *       { accountKind: "cash",    debit: 500000 },
 *       { accountKind: "revenue", credit: 500000 },
 *     ],
 *   })
 *
 * MUVOZANAT shu yerda tekshiriladi (ilgari Mongoose pre-save hook'ida edi).
 */
export const post = async ({
  branchId,
  date = new Date(),
  kind,
  memo = "",
  lines,
  refModel = null,
  refId = null,
  isInternal = false,
  counterpartyBranchId = null,
  createdBy = null,
  tx = null,
  // ── STEP 4 da qo'shildi ──
  // `postingKey` — idempotentlik kaliti (DB darajasida unique).
  // `dimensions`  — o'lchovlar (studentId, teacherId, courseId...).
  //
  // IKKALASI HAM IXTIYORIY: mavjud chaqiruvchilar (smena yopilishi,
  // o'quvchini ko'chirish) ularni bermaydi va avvalgidek ishlaydi.
  // O'lchovlarni SHU YERDA qabul qilish — ataylab: muvozanat tekshiruvi
  // ham, o'lchov yozuvi ham bitta `create` ichida bo'lsin, ya'ni
  // "o'lchovsiz yozib qo'yish" uchun yon yo'l qolmasin.
  postingKey = null,
  dimensions = null,
}) => {
  if (!branchId) throw new ApiError(400, "Jurnal yozuvi uchun filial kerak");
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new ApiError(400, "Jurnal yozuvida kamida ikkita qator bo'lishi kerak");
  }

  const client = tx || prisma;

  const resolved = [];
  for (const line of lines) {
    const debit = Math.round(Number(line.debit) || 0);
    const credit = Math.round(Number(line.credit) || 0);

    // ── QATOR INVARIANTLARI (ilgari journalEntry.model.js hook'ida edi) ──
    //
    // BULAR YIG'INDI TEKSHIRUVIDAN ALOHIDA VA UNDAN MUHIMROQ:
    // { debit: 500000, credit: 500000 } bo'lgan qator yig'indi
    // tekshiruvidan MUAMMOSIZ o'tadi (debet == kredit), lekin bitta
    // hisobning ikkala tomonini bir vaqtda harakatlantiradi - balans
    // abadiy ikki marta sanaladi va `reconcile()` "hammasi joyida"
    // deb turaveradi. Aynan shu sababdan qator darajasidagi qoidalar
    // ochiq ko'chirildi.
    if (debit < 0 || credit < 0) {
      throw new ApiError(400, "Jurnal qatorida manfiy summa bo'lishi mumkin emas");
    }
    if (debit > 0 && credit > 0) {
      throw new ApiError(
        400,
        "Jurnal qatori bir vaqtda ham debet, ham kredit bo'la olmaydi",
      );
    }
    if (debit === 0 && credit === 0) {
      throw new ApiError(400, "Jurnal qatorida summa bo'lishi shart");
    }

    // eslint-disable-next-line no-await-in-loop
    const account = await ensureAccount(
      branchId,
      line.accountKind,
      line.counterpartyBranchId || null,
      tx,
    );
    resolved.push({
      accountId: account.id,
      accountKind: line.accountKind,
      debit,
      credit,
    });
  }

  // ── MUVOZANAT INVARIANTI ──
  // Debet ≠ kredit bo'lgan yozuv butun jurnalni buzadi va uni keyin
  // topish qiyin, shuning uchun YOZISHDAN OLDIN rad etiladi.
  const totalDebit = resolved.reduce((s, l) => s + l.debit, 0);
  const totalCredit = resolved.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new ApiError(
      400,
      `Jurnal muvozanati buzilgan: debet ${totalDebit} ≠ kredit ${totalCredit}`,
    );
  }

  const entry = await client.journalEntry.create({
    data: {
      branchId: String(branchId),
      date,
      kind,
      memo,
      refModel,
      refId: refId ? String(refId) : null,
      postingKey: postingKey || null,
      isInternal,
      counterpartyBranchId: counterpartyBranchId ? String(counterpartyBranchId) : null,
      totalDebit,
      totalCredit,
      // Chaqiruvchilar `createdBy` nomi bilan uzatadi; ustun `createdById`.
      createdById: createdBy ? String(createdBy) : null,
      // O'LCHOVLAR (STEP 4). Ular `financialTransaction.service.js` da
      // MANBA HUJJATDAN aniqlanadi, chaqiruvchi qo'lidan emas.
      ...(dimensions || {}),
      // Sarlavha va qatorlar BITTA amalda - yarim yozuv bo'lishi mumkin emas.
      lines: { create: resolved },
    },
    include: { lines: true },
  });

  return withLegacyId(entry);
};

/**
 * IDEMPOTENT YOZISH — `postingKey` bo'yicha.
 *
 * Takroriy urinishda (webhook qayta yuborilishi, cron retry, double-click)
 * YANGI yozuv yaratilmaydi: mavjudi qaytariladi. Poyga himoyasi DB
 * darajasida — ikki so'rov bir vaqtda kelsa unique indeks ikkinchisini
 * P2002 bilan rad etadi va biz o'shanda mavjudini o'qiymiz.
 *
 * NEGA XATO QAYTARILMAYDI: chaqiruvchi uchun "allaqachon yozilgan" —
 * MUVAFFAQIYAT. Retry mexanizmi xato ko'rsa yana urinardi va cheksiz
 * halqa hosil bo'lardi.
 *
 * @returns {{entry: object, duplicate: boolean}}
 */
export const postIdempotent = async (args) => {
  const { postingKey, tx } = args;
  if (!postingKey) throw new ApiError(400, "postingKey berilishi shart");
  const client = tx || prisma;

  const existing = await client.journalEntry.findUnique({
    where: { postingKey },
    include: { lines: true },
  });
  if (existing) return { entry: withLegacyId(existing), duplicate: true };

  try {
    return { entry: await post(args), duplicate: false };
  } catch (err) {
    if (err?.code === "P2002") {
      const raced = await client.journalEntry.findUnique({
        where: { postingKey },
        include: { lines: true },
      });
      if (raced) return { entry: withLegacyId(raced), duplicate: true };
    }
    throw err;
  }
};

/**
 * STORNO - xato yozuvni TESKARISI bilan bekor qiladi.
 *
 * Yozuv o'zgarmas, shuning uchun tuzatishning yagona to'g'ri yo'li shu.
 * Audit izi to'liq saqlanadi: xato ham, uni tuzatish ham ko'rinadi.
 */
export const reverse = async (entryId, { memo, createdBy } = {}) => {
  const original = await prisma.journalEntry.findUnique({
    where: { id: String(entryId) },
    include: { lines: true },
  });
  if (!original) throw new ApiError(404, "Jurnal yozuvi topilmadi");

  // Debet va kredit ALMASHTIRILADI - yig'indilar teng bo'lgani uchun
  // teskari yozuv ham avtomatik muvozanatda bo'ladi.
  const lines = original.lines.map((l) => ({
    accountId: l.accountId,
    accountKind: l.accountKind,
    debit: l.credit,
    credit: l.debit,
  }));

  const entry = await prisma.journalEntry.create({
    data: {
      branchId: original.branchId,
      date: new Date(),
      kind: ENTRY_KINDS.ADJUSTMENT,
      memo: memo || `Storno: ${original.memo || original.kind}`,
      refModel: "JournalEntry",
      refId: original.id,
      isInternal: original.isInternal,
      counterpartyBranchId: original.counterpartyBranchId,
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      createdById: createdBy ? String(createdBy) : null,
      lines: { create: lines },
    },
    include: { lines: true },
  });
  return withLegacyId(entry);
};

// ============================================================
// O'QISH
// ============================================================

// Hisoblarni ID bo'yicha yuklab, filial/kontragentini beradi.
const loadAccounts = async (ids) => {
  if (!ids.length) return new Map();
  const rows = await prisma.account.findMany({
    where: { id: { in: ids } },
    select: { id: true, branchId: true, counterpartyBranchId: true },
  });
  return new Map(rows.map((a) => [a.id, a]));
};

/**
 * Hisob qoldiqlari - "filialda qancha pul bor".
 *
 * FILIAL KO'LAMI: `branchFilter()` YOZUV (entry) ustiga qo'llanadi -
 * JournalLine'da `branchId` yo'q, u sarlavhada.
 */
export const balances = async ({ until = null, kinds = null } = {}) => {
  const entryWhere = { ...branchFilter() };
  if (until) entryWhere.date = { lte: until };

  const rows = await prisma.journalLine.groupBy({
    by: ["accountId", "accountKind"],
    where: {
      ...(kinds ? { accountKind: { in: kinds } } : {}),
      ...(Object.keys(entryWhere).length ? { entry: entryWhere } : {}),
    },
    _sum: { debit: true, credit: true },
  });

  const accounts = await loadAccounts(rows.map((r) => r.accountId));

  return rows
    .map((r) => {
      const debit = r._sum.debit ?? 0;
      const credit = r._sum.credit ?? 0;
      return {
        // Filial HISOBDAN olinadi: har hisob aynan bitta filialniki
        // (Account.branchId) va post() faqat o'sha filial hisoblarini
        // ishlatadi - ya'ni natija yozuv sarlavhasidagi bilan bir xil.
        branchId: accounts.get(r.accountId)?.branchId ?? null,
        accountId: r.accountId,
        kind: r.accountKind,
        debit,
        credit,
        // Ishora hisob turiga qarab (NORMAL_SIDE): naqd uchun debet−kredit,
        // qarz uchun kredit−debet.
        balance: signedBalance(r.accountKind, debit, credit),
      };
    })
    .sort((a, b) => String(a.kind).localeCompare(String(b.kind)));
};

/** Faqat XAZINA hisoblari - "Kassa" sahifasi uchun. */
export const treasuryBalances = (opts = {}) => balances({ ...opts, kinds: TREASURY_KINDS });

/**
 * Bitta hisob turining qoldig'i (aniq filial bo'yicha).
 * Smena yopishda "kutilgan naqd" shu orqali hisoblanadi.
 */
export const accountBalance = async (
  branchId,
  kind,
  { from = null, until = null } = {},
) => {
  const dateMatch = {};
  if (from) dateMatch.gte = from;
  if (until) dateMatch.lte = until;

  const agg = await prisma.journalLine.aggregate({
    where: {
      accountKind: kind,
      entry: {
        branchId: String(branchId),
        ...(Object.keys(dateMatch).length ? { date: dateMatch } : {}),
      },
    },
    _sum: { debit: true, credit: true },
  });

  return signedBalance(kind, agg._sum.debit ?? 0, agg._sum.credit ?? 0);
};

// ============================================================
// TEKSHIRUVLAR (reconciliation)
// ============================================================

/**
 * NOMUVOZANAT YOZUVLAR.
 *
 * Invariant `post()` da ta'minlanadi, lekin tekshiruv baribir kerak:
 * bazaga to'g'ridan-to'g'ri yozish (psql, migratsiya, eski skript)
 * servisdan chetlab o'tadi. Bu - oxirgi to'siq.
 *
 * Denormalizatsiya qilingan `totalDebit`/`totalCredit` ustidan ishlaydi,
 * ya'ni millionlab qatorni ochmaydi.
 *
 * Mongo `$expr: { $ne: [...] }` → Prisma "field reference".
 */
export const findUnbalanced = async ({ limit = 50 } = {}) => {
  // ═══════════════════════════════════════════════════════════════
  // XOM SQL - PRISMA MAYDON HAVOLASI `not` BILAN ISHLAMAYDI.
  //
  // Ilgari bu yerda shunday yozilgan edi:
  //   where: { totalDebit: { not: prisma.journalEntry.fields.totalCredit } }
  //
  // Prisma maydon havolalarini (`fields.x`) faqat TENGLIK va
  // taqqoslash operatorlarida qo'llaydi; `not` bilan u
  // `PrismaClientValidationError` beradi. Natijada `/journal/reconcile`
  // BUTUNLAY ishlamasdi - 500 qaytarardi.
  //
  // Bu jimgina buzilish edi: `reconcile()` jurnalning to'g'riligini
  // tekshiradigan YAGONA vosita, ya'ni "muvozanat buzilganmi?" degan
  // savolga javob beradigan joyning O'ZI yiqilgan edi.
  //
  // Xom SQL bu yerda O'RINLI (MIGRATION.md §3.2.4): ustunni ustun
  // bilan solishtirish SQL'ning tabiiy ishi.
  // ═══════════════════════════════════════════════════════════════
  const rows = await prisma.$queryRaw`
    SELECT id, "branchId", date, kind, memo, "totalDebit", "totalCredit"
    FROM journal_entries
    WHERE "totalDebit" <> "totalCredit"
    ORDER BY date DESC
    LIMIT ${limit}
  `;
  return withLegacyIds(rows);
};

/**
 * FILIALLARARO BALANS TEKSHIRUVI.
 *
 * INVARIANT: A ning B dan talabi (due_from) === B ning A ga majburiyati
 * (due_to). Teng bo'lmasa - bir tomon yozilib, ikkinchisi yozilmagan
 * (jarayon uzilgan yoki kod xatosi).
 *
 * KO'LAMSIZ ishlaydi (branchFilter YO'Q) - ataylab: tekshiruv butun
 * tarmoq bo'yicha ma'noga ega va u owner uchun.
 */
export const checkInterBranchBalance = async () => {
  // Mongo'da bu `$unwind` + `$lookup` edi. Prisma'da: qatorlarni hisob
  // bo'yicha guruhlaymiz, filial/kontragentni esa Account jadvalidan
  // olamiz (aynan o'sha ma'lumot, join'siz).
  const rows = await prisma.journalLine.groupBy({
    by: ["accountId", "accountKind"],
    where: { accountKind: { in: INTER_BRANCH_KINDS } },
    _sum: { debit: true, credit: true },
  });

  const accounts = await loadAccounts(rows.map((r) => r.accountId));

  // Juftlarni yig'amiz: A→B due_from va B→A due_to teng bo'lishi kerak.
  const byPair = new Map();
  for (const r of rows) {
    const acc = accounts.get(r.accountId);
    if (!acc) continue;
    const balance = signedBalance(r.accountKind, r._sum.debit ?? 0, r._sum.credit ?? 0);
    const a = String(acc.branchId);
    const b = String(acc.counterpartyBranchId);
    // Juft kaliti - tartiblangan ikki filial (yo'nalishdan qat'i nazar).
    const key = [a, b].sort().join("|");

    const cur = byPair.get(key) || { key, dueFrom: 0, dueTo: 0, branches: [a, b].sort() };
    if (r.accountKind === ACCOUNT_KINDS.DUE_FROM) cur.dueFrom += balance;
    else cur.dueTo += balance;
    byPair.set(key, cur);
  }

  const mismatches = [];
  for (const pair of byPair.values()) {
    if (pair.dueFrom !== pair.dueTo) {
      mismatches.push({
        branches: pair.branches,
        dueFrom: pair.dueFrom,
        dueTo: pair.dueTo,
        diff: pair.dueFrom - pair.dueTo,
      });
    }
  }

  return { pairs: [...byPair.values()], mismatches, balanced: mismatches.length === 0 };
};

/** TO'LIQ TEKSHIRUV - tunggi job va "Kassa" sahifasidagi tugma uchun. */
export const reconcile = async () => {
  const [unbalanced, interBranch] = await Promise.all([
    findUnbalanced({ limit: 20 }),
    checkInterBranchBalance(),
  ]);

  return {
    ok: unbalanced.length === 0 && interBranch.balanced,
    unbalancedEntries: unbalanced,
    interBranch,
  };
};
