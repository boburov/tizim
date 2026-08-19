import {
  BadgeCheck,
  Building2,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  ScrollText,
  Settings,
  Target,
  Wallet,
  BookMarked,
  Activity,
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
      { title: "Davomat", url: "/owner/attendance", permission: "attendance.read" },
      { title: "Baholash", url: "/owner/grades", permission: "grades.record" },
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
  },

  {
    title: "Moliya",
    icon: Wallet,
    isActive: true,
    items: [
      // BOSHQARUV MARKAZI birinchi o'rinda: u "pul qayerda, foyda
      // qayerda, nimaga e'tibor kerak" savollarining boshlang'ich
      // nuqtasi.
      {
        title: "Boshqaruv markazi",
        url: "/owner/finance",
        permission: "finance.read",
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
        title: "Hisobot & statistika",
        url: "/owner/finance/accounting",
        permission: "finance.read",
      },
      {
        title: "To'lovlar",
        url: "/owner/finance/deposits",
        permission: "finance.read",
      },
    ],
  },

  // KASSA — qo'sh yozuv jurnali. Moliya bo'limidan ALOHIDA: u
  // "qancha hisoblangan" ni ko'rsatadi, bu esa "qancha PUL BOR" ni.
  {
    title: "Kassa",
    icon: Wallet,
    items: [
      { title: "Qoldiq va smena", url: "/owner/cash-desk", permission: "finance.read" },
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
    icon: Activity,
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
        permission: "notifications.read",
      },
      { title: "Vazifalar", url: "/owner/assignments", permission: "assignments.read" },
      { title: "Fayl saqlagich", url: "/owner/storage", permission: "storage.manage" },
      { title: "Feedback", url: "/owner/feedback", permission: "feedback.read" },
    ],
  },

  // AUDIT LOGLARI: alohida yakka link, Sozlamalardan OLDIN.
  // Sozlamalar biror narsani O'ZGARTIRISH uchun, log esa kim nima
  // qilganini KUZATISH uchun — bu kundalik nazorat ishi.
  {
    title: "Audit loglari",
    icon: ScrollText,
    url: "/owner/activity-logs",
    permission: "activity_logs.read",
  },

  {
    title: "Sozlamalar",
    icon: Settings,
    url: "/owner/settings",
  },
];

export default ownerSidebar;
