/**
 * ══════════════════════════════════════════════════════════════════════
 * VAKOLAT KATALOGI — ruxsatlarning ODAM TILIDAGI ko'rinishi (talab 7)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Talab ochiq aytadi: ega `finance.view_profitability` kabi TEXNIK
 * kalitni ko'rmasligi kerak. U "kimga nimani ishonaman?" degan savolga
 * javob beradi, ma'lumotlar bazasi sxemasini o'qimaydi.
 *
 * ── NEGA SERVERDA EMAS ──
 * Kalitlar RO'YXATI — serverning ishi (u yagona haqiqat manbai va
 * `/roles/matrix` orqali beradi). Ularni QANDAY GURUHLASH va nima deb
 * ATASH esa mahsulot qarori: bu yerda tahrirlanadi, deploy'siz
 * o'zgaradi va serverdagi xavfsizlik mantig'iga tegmaydi.
 *
 * ── HECH NARSA JIMGINA YO'QOLMAYDI ──
 * `npm run check:capabilities` serverdagi HAR BIR kalit shu yerda
 * borligini tekshiradi. Kalit qo'shilib, katalogga tushmasa, delegatsiya
 * ekrani uni ko'rsatmasdi — ya'ni ega bexosdan bermagan huquqi bo'lardi
 * va buni hech kim sezmasdi.
 *
 * ── `sensitive` NIMA ──
 * Odam kutmagan narsani ochadigan vakolat. Ekranda ogohlantirish
 * belgisi bilan ko'rsatiladi va tavsiya to'plamlariga KIRMAYDI.
 * Misol: "Foydalilik tahlili" — u har bir o'qituvchining MAOSHINI
 * ko'rsatadi, garchi nomi shunday demasa ham.
 */

export const CAPABILITY_GROUPS = Object.freeze([
  {
    key: "students",
    label: "O'quvchilar",
    summary: "Kim o'qiyapti, kim yangi keldi, kim to'xtatdi",
    items: [
      { key: "students.read", label: "O'quvchilar ro'yxatini ko'rish" },
      { key: "students.create", label: "Yangi o'quvchi qo'shish" },
      { key: "students.update", label: "O'quvchi ma'lumotini tahrirlash" },
      {
        key: "students.freeze",
        label: "O'quvchini vaqtincha to'xtatish",
        hint: "To'xtatilgan davrda to'lov hisoblanmaydi",
      },
      {
        key: "students.delete",
        label: "O'quvchini arxivlash",
        hint: "Yozuvlari saqlanadi, ro'yxatdan chiqadi",
      },
    ],
  },
  {
    key: "groups",
    label: "Guruhlar va kurslar",
    summary: "Guruh ochish, o'quvchi biriktirish, jadval",
    items: [
      { key: "groups.read", label: "Guruhlarni ko'rish" },
      { key: "groups.create", label: "Guruh ochish" },
      { key: "groups.update", label: "Guruhni tahrirlash" },
      { key: "groups.manage_students", label: "Guruhga o'quvchi qo'shish va chiqarish" },
      { key: "groups.delete", label: "Guruhni yopish" },
      { key: "courses.read", label: "Yo'nalishlar ro'yxatini ko'rish" },
      {
        key: "courses.manage",
        label: "Yo'nalish va narxlarni boshqarish",
        hint: "Narx o'zgarishi keyingi oy hisob-kitobiga ta'sir qiladi",
        sensitive: true,
      },
    ],
  },
  {
    key: "rooms",
    label: "Xonalar",
    summary: "Filialning fizik resursi: sig'im, jadval, bandlik",
    items: [
      { key: "classes.read", label: "Xonalarni ko'rish" },
      { key: "classes.create", label: "Xona qo'shish" },
      { key: "classes.update", label: "Xonani tahrirlash" },
      { key: "classes.delete", label: "Xonani o'chirish" },
    ],
  },
  {
    key: "attendance",
    label: "Davomat va baholash",
    summary: "Kim keldi, kim kelmadi, qanday o'qiyapti",
    items: [
      { key: "attendance.read", label: "Davomatni ko'rish" },
      { key: "attendance.record", label: "Davomat belgilash" },
      {
        key: "attendance.manage",
        label: "Davomat qoidalarini boshqarish",
        hint: "O'tgan kunlarni tuzatish ham shu yerda",
      },
      { key: "grades.read", label: "Baholarni ko'rish" },
      { key: "grades.record", label: "Baho qo'yish" },
      { key: "grades.manage", label: "Baholash tizimini sozlash" },
      { key: "rating.read", label: "Reytingni ko'rish" },
      { key: "rating.manage", label: "Reyting qoidalarini sozlash" },
    ],
  },
  {
    key: "leads",
    label: "Sotuv (lidlar)",
    summary: "Hali o'quvchi bo'lmagan odamlar bilan ish",
    items: [
      { key: "leads.read", label: "Lidlarni ko'rish" },
      { key: "leads.create", label: "Lid qo'shish" },
      { key: "leads.update", label: "Lid holatini o'zgartirish" },
      {
        key: "leads.manage",
        label: "Lidni o'quvchiga aylantirish",
        hint: "Guruhga yozadi va moliyaviy majburiyat yaratadi",
      },
    ],
  },
  {
    key: "money_daily",
    label: "Kundalik pul ishlari",
    summary: "To'lov qabul qilish, chiqim yozish, kassa",
    items: [
      {
        key: "finance.read",
        label: "Moliyani ko'rish",
        hint: "Daromad, chiqim va byudjetning umumiy manzarasi",
      },
      { key: "finance.pay", label: "O'quvchidan to'lov qabul qilish" },
      { key: "finance.create_expense", label: "Chiqim yozish" },
      { key: "finance.manage_expense", label: "Chiqim kategoriyalarini boshqarish" },
      { key: "expenses.read", label: "Chiqimlarni ko'rish" },
      { key: "expenses.create", label: "Chiqim qo'shish (eski nom)" },
      { key: "expenses.manage", label: "Chiqimni boshqarish (eski nom)" },
      { key: "finance.approve", label: "Limitdan oshgan chiqimni tasdiqlash" },
      {
        key: "approvals.decide_config",
        label: "Maosh stavkasi va chegirmani tasdiqlash",
        hint: "Ta'siri takrorlanadi: bir marta belgilangan stavka har oy ishlaydi",
        sensitive: true,
      },
    ],
  },
  {
    key: "money_control",
    label: "Pul nazorati",
    summary: "Kassa qoldig'i, o'tkazma, qaytarim, hisoblar",
    items: [
      { key: "finance.view_cashflow", label: "Kassa va hisoblar qoldig'ini ko'rish" },
      { key: "finance.view_receivables", label: "Qarzdorlik va undirishni ko'rish" },
      { key: "finance.manage_accounts", label: "Hisob ochish va nomlash" },
      {
        key: "finance.manage_refunds",
        label: "O'quvchiga pul qaytarish",
        hint: "Kassadan pul CHIQARADI",
        sensitive: true,
      },
      { key: "finance.manage_transfers", label: "Hisoblar orasida o'tkazma va inkassatsiya" },
      { key: "finance.manage_budgets", label: "Byudjetni belgilash va o'zgartirish" },
      {
        key: "finance.opening_balance",
        label: "Boshlang'ich qoldiq kiritish",
        hint: "Yozuv O'ZGARMAS — xato faqat tuzatish yozuvi bilan to'g'rilanadi",
        sensitive: true,
      },
      {
        key: "finance.manage",
        label: "Moliyani to'liq boshqarish",
        hint: "Keng huquq — hisob va qaytarimni ham qamraydi",
        sensitive: true,
      },
    ],
  },
  {
    key: "money_owner",
    label: "Egasining puli va foyda",
    summary: "Eng sezgir daraja — odatda faqat egada bo'ladi",
    items: [
      {
        key: "finance.manage_owner_capital",
        label: "Markazga pul kiritish va undan yechib olish",
        hint: "Bu odam markazdan pul chiqara oladi",
        sensitive: true,
      },
      {
        key: "finance.view_profitability",
        label: "Foydalilik tahlili",
        hint: "⚠ O'qituvchi, guruh va yo'nalish TANNARXINI — ya'ni MAOSHNI ko'rsatadi",
        sensitive: true,
      },
    ],
  },
  {
    key: "payroll",
    label: "Maoshlar",
    summary: "O'qituvchi va xodim oyligi",
    items: [
      { key: "salary.read", label: "O'qituvchi maoshlarini ko'rish", sensitive: true },
      { key: "salary.pay", label: "O'qituvchiga maosh to'lash", sensitive: true },
      { key: "payroll.read", label: "Xodimlar oyligini ko'rish", sensitive: true },
      {
        key: "payroll.manage",
        label: "KPI qoidalari va maosh shartnomalari",
        hint: "Kim qancha olishini belgilaydi",
        sensitive: true,
      },
      { key: "payroll.pay", label: "Xodimga maosh to'lash", sensitive: true },
    ],
  },
  {
    key: "people",
    label: "Odamlar",
    summary: "Xodim va o'qituvchilarni boshqarish",
    items: [
      { key: "users.read", label: "Foydalanuvchilarni ko'rish" },
      { key: "users.create", label: "Yangi foydalanuvchi yaratish" },
      { key: "users.update", label: "Foydalanuvchini tahrirlash" },
      { key: "users.archive", label: "Foydalanuvchini arxivlash va tiklash" },
      {
        key: "users.password",
        label: "Parolni ko'rish va almashtirish",
        hint: "Boshqa odamning hisobiga kira olish demakdir",
        sensitive: true,
      },
      { key: "teachers.read", label: "O'qituvchilarni ko'rish" },
      { key: "teachers.create", label: "O'qituvchi qo'shish" },
      { key: "teachers.update", label: "O'qituvchini tahrirlash" },
      { key: "teachers.delete", label: "O'qituvchini arxivlash" },
      { key: "archive_reasons.manage", label: "Arxivlash sabablarini boshqarish" },
    ],
  },
  {
    key: "branches",
    label: "Filiallar",
    summary: "Tashkilot darajasidagi vakolat",
    items: [
      { key: "branches.read", label: "Filial ma'lumotini ko'rish" },
      {
        key: "branches.view_all",
        label: "BARCHA filiallarni ko'rish",
        hint: "Bu ruxsatsiz odam faqat biriktirilgan filialini ko'radi",
        sensitive: true,
      },
      {
        key: "branches.create",
        label: "Yangi filial ochish",
        hint: "Tizim sozlamalariga kirish ruxsati BILAN BIRGA ishlaydi",
        sensitive: true,
      },
      { key: "branches.update", label: "Filialni tahrirlash", sensitive: true },
      { key: "branches.delete", label: "Filialni o'chirish", sensitive: true },
    ],
  },
  {
    key: "communication",
    label: "Aloqa",
    summary: "Xabar, vazifa, feedback",
    items: [
      { key: "notifications.read", label: "Bildirishnomalarni ko'rish" },
      { key: "notifications.send", label: "Bildirishnoma yuborish" },
      { key: "notification_templates.manage", label: "Xabar shablonlarini boshqarish" },
      { key: "assignments.read", label: "Vazifalarni ko'rish" },
      {
        key: "assignments.send",
        label: "Vazifa yuborish",
        hint: "Fayl yuklaydi — markazning disk kvotasini yeydi",
      },
      { key: "storage.manage", label: "Fayl saqlagichni tozalash", sensitive: true },
      { key: "feedback.read", label: "Feedback'larni ko'rish" },
      { key: "feedback.respond", label: "Feedback'ga javob berish" },
      { key: "feedback_types.manage", label: "Feedback turlarini boshqarish" },
      { key: "holidays.manage", label: "Bayram kunlarini belgilash" },
    ],
  },
  {
    key: "system",
    label: "Tizim va nazorat",
    summary: "Boshqaruv paneli, audit, rollar, AI",
    items: [
      {
        key: "admin_dashboard.read",
        label: "Boshqaruv panelini ko'rish",
        hint: "Bu ruxsat odamni FILIAL BOSHQARUVI makoniga olib chiqadi",
      },
      { key: "activity_logs.read", label: "Faoliyat loglarini ko'rish" },
      { key: "ai.read", label: "Tahlil va tavsiyalarni ko'rish" },
      { key: "ai.assistant", label: "AI assistentdan foydalanish", hint: "Har savol pul sarflaydi" },
      { key: "ai.config", label: "AI sozlamalarini o'zgartirish", sensitive: true },
      { key: "roles.read", label: "Rollarni ko'rish" },
      {
        key: "roles.create",
        label: "Yangi rol yaratish",
        hint: "Rol yaratgan odam unga istalgan ruxsatni bera oladi",
        sensitive: true,
      },
      { key: "roles.update", label: "Rol ruxsatlarini o'zgartirish", sensitive: true },
      { key: "roles.delete", label: "Rolni o'chirish", sensitive: true },
      {
        key: "system.admin_access",
        label: "Tizim sozlamalariga to'liq kirish",
        hint: "Filial ochish va tashkilot darajasidagi amallar shu kalit bilan qulflangan",
        sensitive: true,
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // RAG'BAT: TANGA VA MARKET
  // ══════════════════════════════════════════════════════════════════
  //
  // Bu guruh ega uchun eng oson tushuniladigan bo'lim, lekin ikkita
  // yozuvi jiddiy: `coin.manage` — pul emas, LEKIN qiymat chiqaradi
  // (chegarasiz berilsa market ma'nosini yo'qotadi), `coin.settings`
  // esa butun bo'limni bir kalit bilan o'chiradi.
  {
    key: "coin",
    label: "Tanga va market",
    summary: "O'quvchilarni rag'batlantirish: tanga to'plash va sovg'aga almashtirish",
    items: [
      { key: "coin.read", label: "Boshqalarning tangasini ko'rish" },
      {
        key: "coin.manage",
        label: "Qo'lda tanga berish",
        hint: "Hech qanday chegarasi yo'q — berilgan tanga marketdagi mahsulotga aylanadi",
        sensitive: true,
      },
      {
        key: "coin.settings",
        label: "Tanga tizimini yoqish/o'chirish va stavkalarni belgilash",
        hint: "O'chirilsa bo'lim BARCHA foydalanuvchilar uchun yo'qoladi",
        sensitive: true,
      },
      { key: "market.read", label: "Mahsulot va buyurtmalarni ko'rish" },
      { key: "market.manage", label: "Mahsulot qo'shish va tahrirlash" },
      {
        key: "market.fulfill",
        label: "Buyurtmani tasdiqlash va topshirish",
        hint: "Rad etilgan buyurtmaning tangasi o'quvchiga qaytariladi",
      },
    ],
  },
]);

/** `"students.read"` → vakolat yozuvi (topilmasa `null`). */
const INDEX = new Map();
for (const group of CAPABILITY_GROUPS) {
  for (const item of group.items) {
    INDEX.set(item.key, { ...item, group: group.key, groupLabel: group.label });
  }
}

export const findCapability = (key) => INDEX.get(key) || null;

/** Katalogdagi barcha kalitlar — tekshirish skripti shundan foydalanadi. */
export const CATALOG_KEYS = Object.freeze([...INDEX.keys()]);

/** Odam tilidagi nom; katalogda bo'lmasa kalitning o'zi (yashirmaymiz). */
export const capabilityLabel = (key) => INDEX.get(key)?.label || key;

/** Sezgir vakolatlar — ogohlantirish belgisi uchun. */
export const isSensitive = (key) => Boolean(INDEX.get(key)?.sensitive);

export default CAPABILITY_GROUPS;
