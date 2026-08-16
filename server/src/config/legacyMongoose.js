import mongoose from "mongoose";

/**
 * ESKI MONGOOSE QATLAMI - KO'CHIRISH DAVRIDAGI XULQ-ATVOR.
 *
 * ═══════════════════════════════════════════════════════════════════
 * MUAMMO: KO'CHIRILMAGAN MODUL 10 SONIYA OSILIB, KEYIN 500 BERADI.
 *
 * MongoDB ulanishi olib tashlangan, lekin `src/models/*` hali joyida
 * va bir qancha modul ularni ishlatadi. Mongoose standart holatda
 * so'rovni BUFERGA oladi va ulanishni kutadi:
 *
 *   GET /api/ai/insights
 *     -> Insight.find()
 *     -> mongoose buferi 10 000 ms kutadi
 *     -> MongooseError: Operation `insights.find()` buffering timed out
 *     -> errorHandler -> 500 "Serverda xatolik yuz berdi"
 *
 * Bu ikki tomonlama yomon:
 *   1) TEZLIK - har bir so'rov 10 soniya osiladi. Rahbariyat ekrani
 *      bir nechta manbani parallel so'raydi va butun sahifa
 *      "yuklanmoqda" holatida qotib qoladi.
 *   2) MA'NO - 500 "server buzilgan" degani. Aslida server sog'lom,
 *      shunchaki bu modul HALI KO'CHIRILMAGAN. Bu 501 Not Implemented.
 *
 * ═══════════════════════════════════════════════════════════════════
 * YECHIM: BUFERNI O'CHIRAMIZ.
 *
 * `bufferCommands: false` bilan Mongoose ulanishsiz so'rovni KUTMAYDI -
 * darhol xato tashlaydi. `errorHandler` uni tanib, 501 qaytaradi.
 *
 * NEGA MARSHRUT RO'YXATI EMAS: "qaysi modul ko'chirilmagan" degan
 * ro'yxatni qo'lda saqlash ikki tomonlama noto'g'ri bo'lardi.
 *
 *   • Statik import bo'yicha aniqlash HADDAN TASHQARI KENG. Masalan
 *     `/admin-dashboard` `retention.service.js` orqali `user.model.js`
 *     ni import qiladi, lekin `getOverview` uni HECH QACHON
 *     chaqirmaydi - endpoint mukammal ishlaydi (200). Import qilish
 *     zararsiz; faqat SO'ROV BAJARISH osiladi. Ro'yxatga tayansak
 *     ishlab turgan endpointni o'ldirardik.
 *
 *   • Qo'lda yozilgan ro'yxat esa eskiradi: modul ko'chgach kimdir
 *     uni ro'yxatdan o'chirishni unutsa, ishlaydigan endpoint 501
 *     bo'lib turaveradi.
 *
 * Bu yerdagi yondashuv HAQIQATGA tayanadi: so'rov chinakam bajarilsa
 * va ulanish bo'lmasa - 501. Modul Prisma'ga ko'chgach Mongoose
 * chaqiruvi umuman qolmaydi va 501 o'z-o'zidan yo'qoladi. Hech kim
 * hech qaerdan hech narsa o'chirmaydi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * DIQQAT: bu fayl Mongo'ni ULAMAYDI va ulashga urinmaydi ham.
 * Ko'chirish tugagach `src/models/` bilan birga o'chiriladi.
 */
export const configureLegacyMongoose = () => {
  // Ulanishni kutmaymiz - darhol yiqilamiz.
  mongoose.set("bufferCommands", false);
  // `strictQuery` ogohlantirishini o'chiramiz (ko'chirish davrida shovqin).
  mongoose.set("strictQuery", true);
};

/**
 * Xato "Mongo ulanmagan" degan ma'noni bildiradimi.
 *
 * Bufer o'chirilganda Mongoose/driver bir nechta xil xato beradi -
 * versiyaga va chaqiruv turiga qarab. Shuning uchun tekshiruv bir
 * necha belgini qamraydi.
 */
export const isMongoUnavailable = (err) => {
  if (!err) return false;

  const name = err.name || "";
  const msg = String(err.message || "");
  const stack = String(err.stack || "");

  // Driver darajasidagi aniq turlar.
  if (name === "MongoNotConnectedError") return true;
  if (name === "MongoServerSelectionError") return true;

  // ═══════════════════════════════════════════════════════════════
  // MONGOOSE ICHIDAN KELGAN HAR QANDAY XATO - ko'chirilmagan yo'l.
  //
  // Ulanish xatolaridan TASHQARI, yarim ko'chirilgan holat SINXRON
  // xatolarni ham tug'diradi. Aniq misol:
  //
  //   "Arguments must be aggregate pipeline operators"
  //   at Aggregate.append (node_modules/mongoose/lib/aggregate.js)
  //   at historicalCollectionRate (modules/ai/signals/finance.signal.js)
  //
  // Sababi: `branchMatchStage()` endi PRISMA shaklini qaytaradi, AI
  // kodi esa uni hamon Mongo `$match` bosqichi deb quvurga qo'shadi.
  // Bu ulanishga umuman yetib bormaydi - Mongoose uni quvur tuzish
  // paytidayoq rad etadi.
  //
  // NEGA BU 500 EMAS: Mongo ULANMAGAN (`bufferCommands: false`,
  // `mongoose.connect` hech qayerda chaqirilmaydi). Bunday holatda
  // Mongoose ICHIDAN kelgan xato ta'rif bo'yicha "bu kod yo'li hali
  // ko'chirilmagan" degani - server nosozligi emas.
  //
  // QAMROV QAT'IY CHEKLANGAN: stek AYNAN `node_modules/mongoose/`
  // ichidan boshlanishi kerak. Ko'chirilgan (Prisma) koddagi haqiqiy
  // xato bu shartga tushmaydi va 500 bo'lib qolaveradi - foydalanuvchi
  // talabi shuni aniq belgilaydi ("Never convert genuine 500s into
  // 501s").
  //
  // Modul Prisma'ga ko'chgach Mongoose steki umuman paydo bo'lmaydi
  // va bu shox o'z-o'zidan ishlamay qoladi.
  // ═══════════════════════════════════════════════════════════════
  if (/[/\\]node_modules[/\\]mongoose[/\\]/.test(stack)) return true;

  // Matn bo'yicha - Mongoose versiyasiga qarab uch xil ko'rinishda
  // keladi. Uchalasi ham TEKSHIRILGAN, taxmin emas:
  //
  //   1) bufer YOQIQ (eski xatti-harakat, bu fayl chaqirilmasa):
  //      "Operation `insights.find()` buffering timed out after 10000ms"
  //
  //   2) bufer O'CHIQ (hozirgi sozlama) - Mongoose 8:
  //      "Cannot call `insights.find()` before initial connection is
  //       complete if `bufferCommands = false`"
  //
  //   3) umumiy ulanish xabarlari (boshqa chaqiruv yo'llari):
  //      "Client must be connected before running operations"
  const CONNECTION_ERRORS =
    /buffering timed out|before initial connection is complete|must be connected|not connected|Topology is closed/i;

  // `MongooseError` va `MongoError` - ikkala oila ham tekshiriladi.
  // Nomga QAT'IY bog'lanmaymiz: `Cannot call ... bufferCommands`
  // xabari `MongooseError` bilan keladi, lekin kelajakdagi versiya
  // uni boshqa sinf bilan berishi mumkin - matn esa barqaror.
  return CONNECTION_ERRORS.test(msg);
};

export default configureLegacyMongoose;
