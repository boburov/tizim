/**
 * BRAUZER DVIGATELI TANLAGICHI — barcha qabul testlari uchun bitta joy.
 *
 * Standart: `chromium`. `BROWSER=webkit` bersangiz — Safari'ning HAQIQIY
 * render dvigateli ishga tushadi.
 *
 * ── NEGA WEBKIT, SAFARI.APP EMAS ──
 * Playwright Safari.app'ni boshqara olmaydi (buning uchun `safaridriver` +
 * Selenium kerak, u headless ishlamaydi va bir vaqtda bitta sessiya beradi).
 * WebKit esa Safari bilan bir xil dvigatel: CSS grid/flex farqlari,
 * `Date` parsing, `:has()`, IndexedDB va scroll xatti-harakati AYNAN shu
 * yerda buziladi. Chromium ularning birontasini ham ko'rmaydi.
 *
 * Safari.app'ga xos va bu yerda TUTILMAYDIGAN narsalar: ITP/cookie
 * siyosati, kengaytmalar, PWA o'rnatish oqimi. Ular uchun haqiqiy Safari
 * kerak.
 *
 * ── DVIGATEL BINARI ──
 * `~/Library/Caches/ms-playwright/` da bo'lishi shart. Yo'q bo'lsa:
 *   npx playwright install webkit
 */
export const pickEngine = (pw) => {
  /**
   * "Playwright yo'q" va "brauzer nomi xato" — IKKI BOSHQA nosozlik.
   *
   * `a11yAcceptance.mjs` Playwright topilmasa `pw` ni `null` qoldiradi va
   * o'zi tekshirmaydi. Ikkalasini bitta xabarga qo'shsak, modul yo'qligi
   * "BROWSER qiymati xato" bo'lib ko'rinardi va odam mavjud env'ni
   * qidirib vaqt yo'qotardi.
   */
  if (!pw) {
    console.error(
      "\nPLAYWRIGHT TOPILMADI — brauzer qabul testi BAJARILMADI.\n" +
        "O'rnatish: npx playwright install chromium webkit\n",
    );
    process.exit(2);
  }
  const name = process.env.BROWSER || "chromium";
  const engine = pw?.[name];
  /**
   * Noma'lum nom JIMGINA chromium'ga tushmaydi.
   *
   * `BROWSER=safari` deb yozgan odam testni Safari dvigatelida ishlayapti
   * deb o'ylardi, aslida yana Chromium ko'rardi — ya'ni yashil natija
   * tekshirilmagan narsa haqida bo'lardi.
   */
  if (typeof engine?.launch !== "function") {
    console.error(
      `\nNOMA'LUM BROWSER="${name}" — brauzer testi BAJARILMADI.\n` +
        "Kutilgan qiymatlar: chromium | webkit | firefox\n" +
        "Safari uchun: BROWSER=webkit\n",
    );
    process.exit(2);
  }
  console.log(`\n🌐 Brauzer dvigateli: ${name}\n`);
  return engine;
};
