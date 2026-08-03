import "dotenv/config";
import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import mongoose from "mongoose";

import env from "../config/env.js";
import logger from "../config/logger.js";
import { connectDB, disconnectDB } from "../config/db.js";

// BAZANI TOZALASH.
//
// FAQAT SHU LOYIHAGA tegishli kolleksiyalar o'chiriladi - `dropDatabase()`
// ATAYLAB ishlatilmaydi. Sabab: bitta Mongo bazasida boshqa narsa ham
// turgan bo'lishi mumkin, va butun bazani uchirish qaytarib bo'lmaydigan
// yon ta'sir berardi. Ro'yxat `src/models/*.model.js` dan HOSILA: yangi
// model qo'shilsa u ham avtomatik qamraladi, qo'lda yangilash shart emas.
//
// ISHLATILISHI:
//   npm run db:clean                          # QURUQ ishga tushirish (hech narsa o'chmaydi)
//   npm run db:clean -- --yes --db=bayyina    # HAQIQIY tozalash
//
// BAYROQLAR:
//   --yes              tasdiq: haqiqatan o'chirish (aks holda faqat hisobot)
//   --db=<nom>         baza nomi QO'LDA yozilishi shart (--yes bilan majburiy)
//   --keep-auth        Permission + Role + owner foydalanuvchi SAQLANADI
//   --drop             kolleksiyalar butunlay drop qilinadi (indekslar ham)
//   --force-remote     MONGO_URL localhost bo'lmasa ham ruxsat
//   --force-production NODE_ENV=production bo'lsa ham ruxsat
//   --no-hints         "keyingi qadamlar" maslahatini chiqarmaydi
//                      (db-reset.sh seed'larni o'zi ishga tushiradi)

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const flagValue = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const OPTS = {
  confirmed: hasFlag("yes"),
  dbName: flagValue("db"),
  keepAuth: hasFlag("keep-auth"),
  drop: hasFlag("drop"),
  forceRemote: hasFlag("force-remote"),
  forceProduction: hasFlag("force-production"),
  noHints: hasFlag("no-hints"),
};

// --keep-auth bilan saqlanadigan modellar (tizimga kira olish uchun).
const AUTH_MODELS = new Set(["Permission", "Role"]);

// Mongoose modeli YO'Q, lekin shu loyihaga tegishli kolleksiyalar.
// Agenda o'z navbatini shu yerda saqlaydi - tozalanmasa eski (endi
// mavjud bo'lmagan hujjatlarga ishora qiluvchi) vazifalar qayta ishga
// tushib, xato loglari yog'ilardi.
const EXTRA_COLLECTIONS = ["agendaJobs"];

const bail = (message) => {
  logger.error(message);
  process.exit(1);
};

/** Barcha modellarni ro'yxatdan o'tkazadi (mongoose.models to'lishi uchun). */
const loadAllModels = async () => {
  const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "models");
  const files = (await readdir(modelsDir)).filter((f) => f.endsWith(".model.js"));
  for (const file of files) {
    await import(pathToFileURL(join(modelsDir, file)).href);
  }
  return files.length;
};

/** MONGO_URL lokal manzilgami. Parse bo'lmasa "noma'lum" (=lokal emas). */
const isLocalHost = (uri) => {
  try {
    const { hostname } = new URL(uri);
    return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname);
  } catch {
    return false;
  }
};

const clean = async () => {
  // --- XAVFSIZLIK 1: production ---
  if (env.NODE_ENV === "production" && !OPTS.forceProduction) {
    bail(
      "NODE_ENV=production - tozalash to'xtatildi. " +
        "Rostdan kerak bo'lsa: --force-production",
    );
  }

  // --- XAVFSIZLIK 2: masofaviy baza ---
  if (!isLocalHost(env.MONGO_URL) && !OPTS.forceRemote) {
    bail(
      "MONGO_URL lokal emas (masofaviy/bulutli baza) - tozalash to'xtatildi. " +
        "Rostdan kerak bo'lsa: --force-remote",
    );
  }

  const modelCount = await loadAllModels();
  await connectDB();

  const conn = mongoose.connection;
  const dbName = conn.name;
  const host = conn.host || "(noma'lum)";

  // --- XAVFSIZLIK 3: baza nomi QO'LDA yozilishi shart ---
  // Eng muhim to'siq: noto'g'ri bazaga ulanib turgan bo'lsangiz,
  // yozilgan nom mos kelmaydi va hech narsa o'chmaydi.
  if (OPTS.confirmed && OPTS.dbName !== dbName) {
    await disconnectDB();
    bail(
      OPTS.dbName
        ? `Baza nomi mos emas: siz "${OPTS.dbName}" deb yozdingiz, ulanish esa "${dbName}". Hech narsa o'chirilmadi.`
        : `Tasdiq uchun baza nomini yozing: --db=${dbName}. Hech narsa o'chirilmadi.`,
    );
  }

  // --- Nishonlarni yig'ish ---
  const existing = new Set(
    (await conn.db.listCollections().toArray()).map((c) => c.name),
  );

  const targets = [];
  const skipped = [];

  for (const [modelName, Model] of Object.entries(mongoose.models)) {
    const collName = Model.collection.collectionName;
    if (!existing.has(collName)) continue;

    if (OPTS.keepAuth && AUTH_MODELS.has(modelName)) {
      skipped.push({ collName, why: "--keep-auth" });
      continue;
    }

    // Owner foydalanuvchi saqlansa - qolgan hammasi o'chadi.
    const filter =
      OPTS.keepAuth && modelName === "User" ? { role: { $ne: "owner" } } : {};

    targets.push({
      collName,
      filter,
      count: await conn.collection(collName).countDocuments(filter),
      partial: Object.keys(filter).length > 0,
    });
  }

  for (const collName of EXTRA_COLLECTIONS) {
    if (!existing.has(collName)) continue;
    targets.push({
      collName,
      filter: {},
      count: await conn.collection(collName).countDocuments({}),
      partial: false,
    });
  }

  // Loyihaga TEGISHLI BO'LMAGAN kolleksiyalar - ularga TEGILMAYDI.
  const known = new Set([...targets.map((t) => t.collName), ...skipped.map((s) => s.collName)]);
  const foreign = [...existing].filter((c) => !known.has(c));

  // --- Hisobot ---
  const mode = OPTS.confirmed ? "TOZALASH" : "QURUQ ISHGA TUSHIRISH (hech narsa o'chmaydi)";
  const total = targets.reduce((sum, t) => sum + t.count, 0);

  console.log(`\n  Rejim  : ${mode}`);
  console.log(`  Baza   : ${dbName} @ ${host}`);
  console.log(`  Usul   : ${OPTS.drop ? "collection.drop() - indekslar ham o'chadi" : "deleteMany() - indekslar qoladi"}`);
  console.log(`  Modellar: ${modelCount} ta fayl yuklandi\n`);

  const nonEmpty = targets.filter((t) => t.count > 0).sort((a, b) => b.count - a.count);
  if (nonEmpty.length === 0) {
    console.log("  Bo'sh - o'chiradigan hujjat yo'q.\n");
  } else {
    const pad = Math.max(...nonEmpty.map((t) => t.collName.length));
    for (const t of nonEmpty) {
      const suffix = t.partial ? "  (owner'dan tashqari)" : "";
      console.log(`  ${t.collName.padEnd(pad)}  ${String(t.count).padStart(8)}${suffix}`);
    }
    console.log(`  ${"-".repeat(pad + 10)}`);
    console.log(`  ${"JAMI".padEnd(pad)}  ${String(total).padStart(8)}\n`);
  }

  if (skipped.length) {
    console.log(`  Saqlanadi (${skipped[0].why}): ${skipped.map((s) => s.collName).join(", ")}\n`);
  }
  if (foreign.length) {
    console.log(`  TEGILMAYDI (loyihaga tegishli emas): ${foreign.join(", ")}\n`);
  }

  if (!OPTS.confirmed) {
    // db-reset.sh o'zi tasdiq so'raydi - bu maslahat u yerda ortiqcha.
    if (!OPTS.noHints) {
      console.log("  Haqiqatan tozalash uchun:");
      console.log(`    npm run db:clean -- --yes --db=${dbName}\n`);
    }
    await disconnectDB();
    return;
  }

  // --- Bajarish ---
  let removed = 0;
  for (const t of targets) {
    if (OPTS.drop && !t.partial) {
      // `drop()` bo'sh kolleksiyada ham xato bermaydi (yuqorida mavjudligini
      // tekshirdik), lekin poyga holatida NamespaceNotFound bo'lishi mumkin.
      await conn.collection(t.collName).drop().catch(() => null);
    } else {
      const res = await conn.collection(t.collName).deleteMany(t.filter);
      removed += res.deletedCount;
      continue;
    }
    removed += t.count;
  }

  logger.info({ database: dbName, removed }, "Baza tozalandi");

  // db-reset.sh seed'larni O'ZI ishga tushiradi - u yerda bu maslahat
  // faqat chalg'itardi ("owner seed qiling" deb yozib, keyin o'zi qilardi).
  if (!OPTS.noHints) {
    console.log("\n  Keyingi qadamlar:");
    console.log("    npm run seed:permissions   # ruxsatlar va rollar");
    if (!OPTS.keepAuth) console.log("    npm run seed:owner         # owner hisobi");
    console.log("    npm run seed:communication # bayramlar va shablonlar");
    console.log("  «Asosiy filial» server ishga tushganda o'zi yaratiladi.\n");
  }

  await disconnectDB();
};

clean().catch(async (err) => {
  logger.error({ err }, "Baza tozalashda xato");
  await disconnectDB().catch(() => null);
  process.exit(1);
});
