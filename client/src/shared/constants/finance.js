/**
 * MOLIYAVIY ATAMALARNING ODAM TILIDAGI NOMLARI (talab 24).
 *
 * ── NEGA BIR JOYDA ──
 * Bu xaritalar UCHTA joyda alohida yashardi: tranzaksiya panelida,
 * pul oqimi bo'limida va daromad kesimida. Natijada bitta narsa uch xil
 * ko'rinardi — bir ekranda "Click", boshqasida "click", uchinchisida
 * umuman ko'rsatilmasdi. Foydalanuvchi uchun bu uchta boshqa-boshqa
 * tushuncha bo'lib tuyulardi.
 *
 * Server enum qiymatlarini o'zgartirmaydi va o'zgartirmasligi ham
 * kerak (ular bazada). Ko'rinadigan nom esa MAHSULOT qarori va u
 * shu yerda.
 */

/** To'lov kanali (`PaymentTransaction.method`). */
export const PAYMENT_METHOD_LABEL = Object.freeze({
  cash: "Naqd",
  card: "Karta",
  click: "Click",
  payme: "Payme",
  uzcard: "Uzcard",
  humo: "Humo",
  bank: "Bank",
  transfer: "O'tkazma",
});

/** Moliyaviy hisob turi (`Account.kind`). */
export const ACCOUNT_KIND_LABEL = Object.freeze({
  cash: "Naqd (kassa)",
  terminal: "Terminal",
  click: "Click",
  payme: "Payme",
  uzcard: "Uzcard",
  humo: "Humo",
  bank: "Bank hisobi",
  transit: "Yo'ldagi pul",
  due_from: "Filialdan talab",
  due_to: "Filialga majburiyat",
  deposit: "O'quvchi depoziti",
  equity: "Kapital",
  revenue: "Daromad",
  expense: "Xarajat",
  shortage: "Kamomad",
  owner_capital: "Egasi kapitali",
  payment_fee: "To'lov komissiyasi",
  other: "Boshqa",
});

/**
 * Nomi topilmasa XOM QIYMAT qaytariladi, "—" EMAS.
 *
 * Sabab: server yangi kanal qo'shsa (masalan "uzum"), u ekranda
 * tanib bo'lmaydigan chiziqcha bo'lib emas, o'z nomi bilan chiqadi.
 * Chiziqcha "ma'lumot yo'q" degani va u yolg'on bo'lardi.
 */
export const paymentMethodLabel = (v) => PAYMENT_METHOD_LABEL[v] || v || "";
export const accountKindLabel = (v) => ACCOUNT_KIND_LABEL[v] || v || "";
