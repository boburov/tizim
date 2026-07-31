import {
  BadgeCheck,
  Building2,
  GraduationCap,
  LayoutDashboard,
  Bot,
  MessagesSquare,
  Settings,
  Wallet,
} from "lucide-react";

// MENYU TUZILISHI
//
// Uchta o'lchov aralashib ketgan edi: subyekt (o'quvchi/guruh/filial),
// ish (davomat/baholash/lid) va sozlama. 30 ta havoladan 11 tasi sozlama
// bo'lib, olti xil guruhga sochilgandi - "Sozlamalar" nomi uchta guruhda
// takrorlanardi.
//
// Yechim: sozlamalar butunlay ajratildi (/owner/settings), qolgani esa
// kundalik ish bo'yicha guruhlandi. 10 bo'lim / 30 havola -> 7 / 15.
//
// Yozuv turlari:
//   • GURUH      - `items` massivi bor, ochiladigan collapsible
//   • YAKKA LINK - `url` bor, `items` yo'q, to'g'ridan-to'g'ri havola
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
  // Bitta narsa uchun ikkita bosiladigan element - foydalanuvchi qaysi
  // birini bosishni bilmasdi, qo'ng'iroq esa qidiruv kengligini yerdi.
  //
  // Endi qator o'zi panelni ochadi: navbat sahifani tark etmasdan
  // ko'riladi, to'liq ro'yxatga panel ichidagi "Barchasini ko'rish"
  // olib boradi (marshrut o'zi joyida - /owner/expense-approvals).
  {
    title: "Tasdiqlar",
    icon: BadgeCheck,
    sheet: "approvals",
    permissionAnyOf: ["finance.read", "approvals.decide_config"],
  },

  // AI operatsiyalar markazi: YAKKA link, "Bosh sahifa"dan keyin darhol.
  // Sabab - bu ertalabki birinchi ekran bo'lishi kerak ("bugun nima
  // qilaman?"), guruh ichiga yashirilsa kundalik odatga aylanmaydi.
  //
  // Vazifalar (/ai/tasks) va hisobotlar (/ai/reports) ATAYLAB bu yerda
  // YO'Q: `items` qo'shilishi bilan AppSidebar bu yozuvni ochiladigan
  // guruhga aylantiradi va yakka link bo'lmay qoladi - yuqoridagi
  // sababning aynan o'zi buziladi. Ularga havola brifing sahifasining
  // sarlavhasida turadi.
  {
    title: "AI maslahatchi",
    icon: Bot,
    url: "/owner/ai",
    permission: "ai.read",
  },

  {
    title: "O'quv jarayoni",
    icon: GraduationCap,
    isActive: true,
    items: [
      // Har bir subyekt bitta havola: unga tegishli hamma narsa
      // (to'lov, maosh, statistika) sahifa ichidagi tab.
      { title: "O'quvchilar", url: "/owner/students", permission: "users.read" },
      {
        title: "O'qituvchilar",
        url: "/owner/teachers",
        permission: "users.read",
      },
      { title: "Guruhlar", url: "/owner/groups", permission: "groups.read" },
      // Davomat: umumiy/guruh hisoboti + belgilash - bitta sahifa, uch tab.
      { title: "Davomat", url: "/owner/attendance", permission: "attendance.read" },
      // Baholash: baho qo'yish + reyting.
      { title: "Baholash", url: "/owner/grades", permission: "grades.record" },
    ],
  },

  {
    title: "Moliya",
    icon: Wallet,
    isActive: true,
    items: [
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

  // Yakka o'quv markazida (MULTI_BRANCH=false) bu bo'lim UMUMAN ko'rinmaydi -
  // filial ro'yxati, taqqoslash va filiallar kesimidagi statistika bir filial
  // uchun ma'nosiz. Yagona filialning ma'lumoti Sozlamalar > Markaz'da.
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
        // Filiallararo ko'rinish: bitta filial tanlangan holatda ma'nosiz
        // (filialni o'zi bilan taqqoslash), shuning uchun faqat
        // "Barcha filiallar" rejimida chiqadi.
        allBranchesOnly: true,
      },
      {
        title: "Statistika",
        url: "/owner/branches/stats",
        permission: "branches.read",
        // Filiallararo ko'rinish: bitta filial tanlangan holatda ma'nosiz
        // (filialni o'zi bilan taqqoslash), shuning uchun faqat
        // "Barcha filiallar" rejimida chiqadi.
        allBranchesOnly: true,
      },
    ],
  },

  {
    title: "Aloqa",
    icon: MessagesSquare,
    items: [
      { title: "Lidlar", url: "/owner/leads", permission: "leads.read" },
      {
        title: "Bildirishnomalar",
        url: "/owner/notifications",
        permission: "notifications.read",
      },
      { title: "Feedback", url: "/owner/feedback", permission: "feedback.read" },
    ],
  },

  // Ilgari 6 guruhga sochilgan 11 ta konfiguratsiya sahifasi shu yerda,
  // chap ustunli yagona qobiqda.
  {
    title: "Sozlamalar",
    icon: Settings,
    url: "/owner/settings",
  },
];

export default ownerSidebar;
