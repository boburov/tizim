import app from "./app.js";
import env from "./config/env.js";
import logger from "./config/logger.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { startJobs, stopJobs } from "./jobs/index.js";
import { startBot, stopBot } from "./bot/index.js";
import Branch from "./models/branch.model.js";
import { ensureMainBranch } from "./helpers/branchAccess.helper.js";

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

const start = async () => {
  await connectDB();
  // FILIAL KAFOLATI: bazada birorta filial bo'lmasa "Asosiy filial"
  // yaratiladi. Shundan keyin markaz DOIM kamida bitta filialli bo'ladi,
  // ya'ni "filial tanlanmagan" turkumidagi yozish xatolari tug'ilmaydi.
  await ensureMainBranch();
  await warnBranchModeMismatch();
  await startJobs();
  await startBot().catch((err) => logger.error({ err }, "Bot ishga tushmadi"));

  const server = app.listen(env.PORT, () => {
    logger.info(`Server ${env.PORT}-portda ishga tushdi`);
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
