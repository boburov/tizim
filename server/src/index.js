import app from "./app.js";
import env from "./config/env.js";
import logger from "./config/logger.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { startJobs, stopJobs } from "./jobs/index.js";
import { startBot, stopBot } from "./bot/index.js";
import Branch from "./models/branch.model.js";
import { ensureMainBranch } from "./helpers/branchAccess.helper.js";
import { reconcile as reconcileStorage } from "./modules/storage/services/storage.service.js";

// MULTI_BRANCH=false, lekin bazada bir nechta filial bor - mos kelmovchilik.
//
// Ataylab YIQITMAYMIZ: allaqachon ishlab turgan markaz upgrade'dan keyin
// o'chib qolmasligi kerak. Bazaga ham hech narsa yozilmaydi - bayroq faqat
// O'QISH ko'lamini o'zgartiradi, ya'ni uni qaytarsangiz hammasi joyiga
// qaytadi. Lekin hisobotlar shu paytda faqat asosiy filialni qamraydi,
// shuning uchun ogohlantirish baland bo'lishi kerak.
const warnBranchModeMismatch = async () => {
  if (env.MULTI_BRANCH) return;

  const branches = await Branch.find({ isDeleted: false, isActive: true })
    .select("name isMain")
    .lean();

  if (!branches.length) return;

  const main = branches.filter((b) => b.isMain);
  if (main.length !== 1) {
    logger.warn(
      { isMainCount: main.length, total: branches.length },
      "MULTI_BRANCH=false, lekin asosiy filial aniq emas " +
        "(isMain bitta bo'lishi kerak). Eng eski filial asosiy deb olinadi.",
    );
  }

  if (branches.length > 1) {
    const frozen = branches.filter((b) => !b.isMain).map((b) => b.name);
    logger.warn(
      {
        total: branches.length,
        main: main[0]?.name || "(eng eski)",
        frozen,
      },
      "MULTI_BRANCH=false, lekin bazada bir nechta filial bor. " +
        "Faqat ASOSIY filial ko'rinadi; qolganlari muzlatiladi (o'qilmaydi ham, " +
        "yozilmaydi ham) va hisobotlarga KIRMAYDI. Ma'lumot o'chmaydi - " +
        "MULTI_BRANCH=true qilsangiz hammasi qaytadi.",
    );
  }
};

// Fon xizmatlari: joblar, saqlagich hisoblagichi va Telegram bot.
//
// HECH BIRI portni ochishni kutib turmaydi - pastdagi izohga qarang.
// Har biri alohida catch bilan: bittasi yiqilsa qolganlari ishlayveradi.
const startBackgroundServices = async () => {
  await warnBranchModeMismatch().catch((err) =>
    logger.warn({ err }, "Filial rejimini tekshirib bo'lmadi"),
  );

  // SAQLASH HISOBLAGICHI: band hajm atomik hisoblagichda turadi, lekin
  // jarayon joyni band qilib, faylni yozishdan oldin yiqilsa unda "band"
  // bo'lgan bayt qolib ketadi. Har ishga tushishda uni haqiqat (diskdagi
  // fayllar ro'yxati) bo'yicha tekislaymiz - aks holda kvota asta-sekin
  // o'z-o'zidan kamayib borardi.
  await reconcileStorage().catch((err) =>
    logger.warn({ err }, "Saqlash hisoblagichini tekislab bo'lmadi"),
  );

  await startJobs().catch((err) =>
    logger.error({ err }, "Joblar ishga tushmadi"),
  );
  await startBot().catch((err) => logger.error({ err }, "Bot ishga tushmadi"));

  logger.info("Fon xizmatlari tayyor");
};

const start = async () => {
  // FAQAT SHU IKKISI portni ochishdan OLDIN bo'lishi shart: baza ulanmasa
  // yoki filial kafolati bajarilmasa har bir so'rov baribir xato qaytaradi.
  await connectDB();
  // FILIAL KAFOLATI: bazada birorta filial bo'lmasa "Asosiy filial"
  // yaratiladi. Shundan keyin markaz DOIM kamida bitta filialli bo'ladi,
  // ya'ni "filial tanlanmagan" turkumidagi yozish xatolari tug'ilmaydi.
  await ensureMainBranch();

  // PORT ENG BIRINCHI OCHILADI - joblar va botdan OLDIN.
  //
  // Aks holda ishga tushish shu ikkisining eng sekiniga bog'lanib qolardi:
  // `bot.startPolling()` Telegram 409 Conflict'ga (boshqa instans polling
  // qilyapti) urilganda ichki qayta urinishlar bilan bir necha o'nlab
  // soniya osilib turadi. O'sha oynada port UMUMAN ochilmaydi, ya'ni
  // frontend'dagi login "Network Error" beradi - server aslida tirik
  // bo'lsa ham. Joblar ham xuddi shunday: boot catch-up hisoblari og'ir.
  //
  // Ikkalasi ham HTTP so'rovlariga kerak emas, shuning uchun ular fonda
  // ko'tariladi va login birinchi soniyadanoq ishlaydi.
  const server = app.listen(env.PORT, () => {
    logger.info(`Server ${env.PORT}-portda ishga tushdi`);
    startBackgroundServices();
  });

  // Port band bo'lsa Node "unhandled 'error' event" bilan tushunarsiz stack
  // tashlaydi. Sababi deyarli har doim bitta - eski nusxa o'chmagan.
  server.on("error", (err) => {
    if (err?.code === "EADDRINUSE") {
      logger.error(
        `${env.PORT}-port band. Eski server nusxasi ishlab turibdi - uni ` +
          `to'xtating (lsof -ti:${env.PORT} | xargs kill) yoki PORT ni o'zgartiring.`,
      );
    } else {
      logger.error({ err }, "HTTP server xatosi");
    }
    process.exit(1);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, "Tartibli to'xtatish boshlandi");
    server.close();
    await stopBot().catch(() => null);
    await stopJobs().catch(() => null);
    await disconnectDB().catch(() => null);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

start().catch((err) => {
  logger.error({ err }, "Server ishga tushmadi");
  process.exit(1);
});
