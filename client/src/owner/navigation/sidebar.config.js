import {
  BadgeCheck,
  Building2,
  DoorOpen,
  Store,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  ScrollText,
  Settings,
  Target,
  Wallet,
  BookMarked,
  MonitorCog,
} from "lucide-react";

/**
 * ══════════════════════════════════════════════════════════════════════
 * ADMIN PANELINING O'Z MENYUSI
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BU FAYL QAYTA TIKLANDI ──
 * Bir muddat Admin panelining menyusi "ish makoni" degan umumiy
 * hisobdan (`shared/workspaces/navigation.js`) kelardi: rol va
 * ruxsatlardan makon hisoblanib, o'sha makonning ro'yxati
 * ko'rsatilardi. Natijada ISHLAB TURGAN panel o'z navigatsiyasini
 * yo'qotdi va uning tuzilishi boshqa joydagi hisobga bog'liq bo'lib
 * qoldi — ya'ni Admin paneli amalda ALMASHTIRILGAN edi.
 *
 * Menyu panelning o'ziniki. Ruxsat bo'yicha kesish qoladi (`permission`),
 * lekin TUZILISH shu yerda va faqat shu yerda.
 *
 * ── KO'LAM ──
 * Bu menyu Super Admin uchun ham, filial administratori uchun ham
 * BIR XIL. Farq — MA'LUMOTDA: server har so'rovda filial ko'lamini
 * qo'llaydi, ya'ni administrator o'z filialining o'quvchisini,
 * xonasini va pulini ko'radi. Bitta panel, ikki ko'lam (talab 34).
 *
 * Filiallararo yozuvlar (`allBranchesOnly`) esa faqat "Barcha
 * filiallar" rejimida chiqadi — bu rejim bitta filialga biriktirilgan
 * odamda umuman mavjud emas.
 *
 * Yozuv turlari:
 * ── `capability` — TARIF KALITI (yoki massiv) ──
 *
 * `permission` "menda huquq bormi" degan savolga javob beradi;
 * `capability` esa "bu bo'lim shu loyihada UMUMAN bormi". Ikkisi
 * ORTOGONAL: tarifda yo'q bo'lim to'liq huquqli egaga ham
 * ko'rinmasligi kerak. Kalitlar `useFeatures()` dan keladi va manbai
 * server reyestri (`common/features/feature-registry.ts`).
 *
 * ⚠ Massiv berilsa HAMMASI talab qilinadi. Market shunday: tarifda
 * sotib olingan VA ega tanga tizimini yoqgan bo'lishi kerak.
 *
 * ⚠ O'ZAK bo'limlarga (`users`, `groups`, `auth`, `branches`,
 * `courses`) `capability` QO'YILMAYDI — ular hech qachon
 * o'chirilmaydi va yozuv faqat shovqin bo'lardi.
 *
 *   • GURUH      — `items` massivi bor, ochiladigan collapsible
 *   • YAKKA LINK — `url` bor, `items` yo'q
 *   • PANEL      — `sheet` bor, yonboshdan panel ochadi
 */
const ownerSidebar = [
  {
    title: "Bosh sahifa",
    icon: LayoutDashboard,
    url: "/owner/dashboard",
    permission: "admin_dashboard.read",
    capability: "admin-dashboard",
  },

  // PANEL ochadigan qator (`sheet`), oddiy havola emas.
  //
  // Ilgari bu yakka link edi va kutilayotgan sanoq IKKI joyda turardi:
  // shu qatordagi badge va qidiruv yonidagi alohida qo'ng'iroq tugmasi.
  // Endi qator o'zi panelni ochadi: navbat sahifani tark etmasdan
  // ko'riladi, to'liq ro'yxatga panel ichidagi "Barchasini ko'rish"
  // olib boradi (marshrut o'z joyida — /owner/expense-approvals).
  {
    title: "Tasdiqlar",
    icon: BadgeCheck,
    sheet: "approvals",
    permissionAnyOf: ["finance.read", "approvals.decide_config"],
  },

  // LIDLAR: alohida yakka link, "O'quv jarayoni"dan OLDIN.
  //
  // Voronka tartibi: lid -> o'quvchi. Menyuni yuqoridan pastga o'qigan
  // odam markazga kirish yo'lini ko'radi. `items` ATAYLAB yo'q:
  // /owner/leads o'zi tabli sahifa va `items` qo'shilishi bilan
  // AppSidebar uni ochiladigan guruhga aylantirib yuborardi.
  {
    title: "Lidlar",
    icon: Target,
    url: "/owner/leads",
    permission: "leads.read",
    capability: "leads",
  },

  {
    title: "O'quv jarayoni",
    icon: GraduationCap,
    isActive: true,
    items: [
      // Har bir subyekt bitta havola: unga tegishli hamma narsa
      // (to'lov, maosh, statistika) sahifa ichidagi tab.
      { title: "O'quvchilar", url: "/owner/students", permission: "users.read" },
      { title: "O'qituvchilar", url: "/owner/teachers", permission: "users.read" },
      // XODIMLAR: ega, o'qituvchilar va custom rollar bitta ro'yxatda.
      { title: "Xodimlar", url: "/owner/staff", permission: "users.read" },
      { title: "Guruhlar", url: "/owner/groups", permission: "groups.read" },
      { title: "Davomat", url: "/owner/attendance", permission: "attendance.read", capability: "attendance" },
      { title: "Baholash", url: "/owner/grades", permission: "grades.record", capability: "grades" },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // XONALAR — YAKKA LINK, KATALOG ICHIDA EMAS (talab 11, 32, 35)
  // ══════════════════════════════════════════════════════════════════
  //
  // Ilgari xonalar "Katalog > Kurslar va xonalar" jadvalining ikkinchi
  // yarmida turardi. Ya'ni "xona qo'shaman" degan odam avval Katalog
  // degan so'zni topishi, keyin uning ichidagi ikkinchi jadvalgacha
  // aylantirishi kerak edi — talab 35 aynan shu holatni misol qilib
  // keltiradi.
  //
  // Xona — filialning FIZIK resursi va u guruh jadvaliga bog'lanadi,
  // ya'ni kundalik ish. Shuning uchun bitta bosishda.
  //
  // KO'LAM: server ro'yxatni administratorning filiali bo'yicha kesadi
  // va yaratishda filialni O'ZI qo'yadi — bu yerda filial tanlagich
  // yo'q va bo'lmasligi ham kerak (talab 32).
  {
    title: "Xonalar",
    icon: DoorOpen,
    url: "/owner/rooms",
    permission: "classes.read",
    capability: "rooms",
  },

  // ══════════════════════════════════════════════════════════════════
  // MARKET — YAKKA LINK, "O'quv jarayoni" DAN KEYIN
  // ══════════════════════════════════════════════════════════════════
  //
  // ── NEGA ALOHIDA QATOR, "Katalog" ICHIDA EMAS ──
  // Market kundalik ish: buyurtma keladi, tasdiqlanadi, topshiriladi.
  // Katalog esa sozlamaga yaqin narsa (yiliga bir marta ochiladi).
  // Kundalik ishni sozlama ichiga yashirish "xonalar" bilan bir marta
  // sodir bo'lgan xato edi (shu faylning yuqorisidagi izohga qarang).
  //
  // ── `capability` NIMA QILADI ──
  // Bu qator RUXSATDAN tashqari BO'LIM YOQILGANLIGINI ham talab qiladi.
  // Ega tanga tizimini o'chirsa, `AppSidebar` uni chizmaydi. Faqat
  // ruxsat tekshirilsa menyuda ishlamaydigan yozuv qolib ketardi va
  // bosilganda odam bosh sahifaga otilardi.
  {
    title: "Market",
    icon: Store,
    url: "/owner/market",
    permissionAnyOf: ["market.read", "market.manage", "market.fulfill"],
    // Ikki qatlam: tarifda "market" sotib olingan VA ega tanga
    // tizimini yoqgan bo'lishi kerak.
    capability: ["market", "coin"],
  },

  // ══════════════════════════════════════════════════════════════════
  // MOLIYA — TO'RT SAVOL, TO'RT YOZUV
  // ══════════════════════════════════════════════════════════════════
  //
  // Ilgari bu yerda IKKI guruh bor edi ("Moliya" va "Kassa") va
  // ularning chegarasi faqat ichkaridan tushunarli edi: birida
  // "qancha hisoblangan", ikkinchisida "qancha pul bor". Foydalanuvchi
  // uchun ikkalasi ham "pul" degan bitta so'z, shuning uchun u har
  // safar ikkalasini ham ochib ko'rardi.
  //
  // Endi bitta guruh va uning boshida TO'RT asosiy yozuv turadi —
  // har biri ALOHIDA savolga javob beradi:
  //
  //   Umumiy      — manzara + shu davrdagi tranzaksiyalar
  //   Chiqimlar   — chiqim yozish va ro'yxati
  //   Pul oqimi   — qancha kirdi, chiqdi, sof qancha
  //   Kassa va hisoblar — qaysi hisobda qancha bor, bugun nima bo'ldi
  //
  // Qolgan uchtasi (undirish, to'lovlar, hisobot) o'z joyida qoladi:
  // ular ham kundalik ish va menyudan olib tashlansa, ularga yo'l
  // faqat xotira orqali qolardi.
  //
  // ── BIR DARAJA, IKKINCHISI YO'Q ──
  // Hech qaysi yozuv ichida yana ro'yxat yo'q. Ichki bo'linish
  // sahifaning O'ZIDA (tab) bo'ladi — menyu esa "qayerga borish"
  // savoliga javob beradi, "u yerda nima bor" savoliga emas.
  {
    title: "Moliya",
    icon: Wallet,
    isActive: true,
    items: [
      // UMUMIY: KPI, signal va shu davrdagi tranzaksiyalar ro'yxati.
      // Raqamdan hujjatgacha bo'lgan yo'l shu yerdan boshlanadi.
      {
        title: "Umumiy",
        url: "/owner/finance",
        permission: "finance.read",
      },
      // CHIQIMLAR — "bugun nima yozildi va yana bittasini qanday
      // yozaman". Bu tahlil EMAS: «Umumiy > Chiqim» tabi diagramma
      // ko'rsatadi ("pul qayerga ketdi"), bu esa kunlik ish ro'yxati.
      //
      // ⚠ `expenses.read` — `finance.read` uni QAMRAMAYDI (serverda
      // ham shunday). Moliyani ko'radigan har xodim chiqim hujjatini
      // ko'ra olmaydi.
      {
        title: "Chiqimlar",
        url: "/owner/finance/expenses",
        capability: "expenses",
        permission: "expenses.read",
      },
      {
        title: "Pul oqimi",
        url: "/owner/finance/cash-flow",
        capability: "finance-analytics",
        permission: "finance.view_cashflow",
      },
      // KASSA VA HISOBLAR: qoldiq kartalari + tanlangan hisobning
      // kunlik harakati. Smena va inkassatsiya AMALLARI o'z sahifasida
      // qoladi (`/owner/cash-desk`) — ular kassirning ishi, bu esa
      // "qancha bor" degan savol.
      {
        title: "Kassa va hisoblar",
        url: "/owner/finance/accounts",
        capability: "finance-analytics",
        permission: "finance.view_cashflow",
      },
      // UNDIRISH — "kim qarzdor va nima qilamiz". Bu administratorning
      // ENG kundalik moliyaviy ishi, lekin u ilgari hisobot ichidagi
      // tab edi va moliyaviy hisobot deb o'ylab ochilmasdi.
      {
        title: "Undirish",
        url: "/owner/finance/undirish",
        permissionAnyOf: ["finance.view_receivables", "finance.read"],
      },
      {
        title: "To'lovlar",
        url: "/owner/finance/deposits",
        permission: "finance.read",
      },
      {
        title: "Hisobot & statistika",
        url: "/owner/finance/accounting",
        capability: "finance-report",
        permission: "finance.read",
      },
      // SMENA VA INKASSATSIYA — kassirning AMALLARI (smena ochish/
      // yopish, pul jo'natish). Ilgari bu alohida "Kassa" guruhi edi;
      // guruh bitta yozuvdan iborat bo'lsa, u guruh emas — bir bosish
      // ortiqcha.
      {
        title: "Smena va inkassatsiya",
        url: "/owner/cash-desk",
        permission: "finance.read",
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // TIZIM TAHLILI — ADMIN UCHUN HAM (talab 31)
  // ══════════════════════════════════════════════════════════════════
  //
  // Xuddi Super Admin panelidagi bo'lim, faqat KO'LAMI filial:
  // "204-xona bo'sh", "101 to'lib ketgan", "A2 guruhga xona
  // biriktirilmagan", "dushanba 18:00 eng band". Tahlil dvigateli
  // BITTA (`modules/ai` + `modules/branchAnalytics`) — bu yerda
  // faqat uning filialga kesilgan ko'rinishi.
  {
    title: "Tizim tahlili",
    icon: MonitorCog,
    url: "/owner/tahlil",
    permissionAnyOf: ["ai.read", "admin_dashboard.read"],
  },

  // KATALOG — kurslar (butun tarmoq uchun umumiy) va narx matritsasi.
  // Xonalar bu yerdan CHIQARILDI (yuqoridagi izohga qarang).
  {
    title: "Katalog",
    icon: BookMarked,
    items: [
      { title: "Kurslar va narxlar", url: "/owner/catalog", permission: "courses.read" },
    ],
  },

  // FILIALLAR — yakka filialli markazda UMUMAN ko'rinmaydi, bitta
  // filialga biriktirilgan administratorda esa faqat "Ro'yxat"
  // qoladi: taqqoslash va statistika filiallararo ko'rinish va ular
  // "Barcha filiallar" rejimini talab qiladi.
  {
    title: "Filiallar",
    icon: Building2,
    multiBranchOnly: true,
    items: [
      { title: "Ro'yxat", url: "/owner/branches", permission: "branches.read" },
      {
        title: "Taqqoslash",
        url: "/owner/branches/compare",
        permission: "branches.read",
        allBranchesOnly: true,
      },
      {
        title: "Tahlil (P&L)",
        url: "/owner/branch-analytics",
        capability: "branch-analytics",
        permission: "finance.read",
      },
      {
        title: "Statistika",
        url: "/owner/branches/stats",
        permission: "branches.read",
        allBranchesOnly: true,
      },
    ],
  },

  // Faqat MAVJUD o'quvchi/ota-ona bilan aloqa. Lidlar yuqorida, alohida.
  {
    title: "Aloqa",
    icon: MessagesSquare,
    items: [
      {
        title: "Bildirishnomalar",
        url: "/owner/notifications",
        capability: "notifications",
        permission: "notifications.read",
      },
      { title: "Vazifalar", url: "/owner/assignments", permission: "assignments.read", capability: "assignments" },
      { title: "Fayl saqlagich", url: "/owner/storage", permission: "storage.manage", capability: "storage" },
      { title: "Feedback", url: "/owner/feedback", permission: "feedback.read", capability: "feedback" },
    ],
  },

  // AUDIT LOGLARI: alohida yakka link, Sozlamalardan OLDIN.
  // Sozlamalar biror narsani O'ZGARTIRISH uchun, log esa kim nima
  // qilganini KUZATISH uchun — bu kundalik nazorat ishi.
  {
    title: "Audit loglari",
    icon: ScrollText,
    url: "/owner/activity-logs",
    capability: "activity-logs",
    permission: "activity_logs.read",
  },

  {
    title: "Sozlamalar",
    icon: Settings,
    url: "/owner/settings",
  },
];

export default ownerSidebar;
