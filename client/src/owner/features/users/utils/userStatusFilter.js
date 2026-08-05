// Foydalanuvchi holati filtri variantlari (tabga bog'liq).
//  • O'quvchilar arxivlanmaydi (faqat muzlatiladi) → "Arxiv" yo'q.
//  • O'qituvchilar muzlatilmaydi → "Muzlatilgan" yo'q.
export const STATUS_LABELS = {
  all: "Hammasi",
  active: "Faol",
  frozen: "Muzlatilgan",
  archived: "Arxiv",
};

const OPTIONS_BY_TAB = {
  students: ["all", "active", "frozen"],
  teachers: ["all", "active", "archived"],
  // Xodim MUZLATILMAYDI - muzlatish o'quvchi tushunchasi. Noma'lum tab
  // "all"ga tushib ketardi va ma'nosiz "Muzlatilgan" tugmasi chiqardi.
  staff: ["all", "active", "archived"],
  all: ["all", "active", "frozen", "archived"],
};

export const allowedStatusesForTab = (tab) =>
  OPTIONS_BY_TAB[tab] || OPTIONS_BY_TAB.all;
