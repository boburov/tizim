import {
  BadgeCheck,
  Building2,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  ScrollText,
  Settings,
  Target,
  Wallet,
  BookMarked,
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

  // RAHBARIYAT QOBIG'IGA O'TISH (/admin) BU RO'YXATDA EMAS.
  //
  // U menyudan CHIQARILDI va sidebar tepasiga, yaratish tugmasi ostiga
  // ko'chirildi (`ExecutiveReturnButton`, AppSidebar). Sabab: bu qator
  // qolgan o'ttizta havoladan boshqa ish qiladi - sahifaga emas,
  // boshqa QOBIQQA olib boradi. Menyu ichida u "yana bitta bo'lim"
  // bo'lib o'qilardi va aynan kerak bo'lgan paytda - operatsion
  // sahifada adashib qolgan paytda - ko'zga tashlanmasdi.
  //
  // Ikki tomonlama yo'l: `/admin` sarlavhasida "Operatsion panel"
  // tugmasi, bu yerda esa "Rahbariyatga qaytish".

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

  // TIZIM TAHLILI RAHBARIYAT QOBIG'IGA KO'CHDI (/admin/tahlil).
  //
  // Bu yerda yozuv YO'Q - ataylab. Brifing "bugun nima qilaman?" degan
  // savolga javob beradi, ya'ni u KUZATUV ekrani, ijro ekrani emas:
  // o'rni sidebar'siz rahbariyat qobig'ida. Ikkala joyda ham turgan
  // bo'lsa, bitta sahifaga ikki xil manzil paydo bo'lardi va qaysi
  // biri "asosiy" ekani noaniq qolardi.
  //
  // `/owner/ai` MARSHRUTLARI JOYIDA QOLADI: tavsiya kartalaridagi
  // `ACTION_ROUTES` havolalari va eski xatcho'plar ishlashda davom
  // etadi (qarang admin/routes/index.jsx). Faqat menyu yozuvi ko'chdi.
  //
  // Rahbariyat qobig'iga o'tish yo'li sidebar tepasida -
  // "Rahbariyatga qaytish" tugmasi (menyu ro'yxatidan tashqarida).

  // LIDLAR: alohida yakka link, "O'quv jarayoni"dan OLDIN.
  //
  // Ilgari "Aloqa" ichida, bildirishnoma va feedback bilan yonma-yon
  // turardi. Uchalasi ham "xabar almashish" degan yuza o'xshashlik
  // bergani uchun bir joyga tushgan edi, lekin ish jihatidan boshqa
  // narsalar: bildirishnoma va feedback - MAVJUD o'quvchi bilan aloqa,
  // lid esa hali o'quvchi BO'LMAGAN odam. Sotuv ishi qo'llab-quvvatlash
  // ishining ichiga ko'milgan edi.
  //
  // Voronka tartibi: lid -> o'quvchi. Shuning uchun "O'quv jarayoni"dan
  // oldin turadi - menyuni yuqoridan pastga o'qigan odam odamning
  // markazga kirish yo'lini ko'radi.
  //
  // `items` ATAYLAB yo'q: /owner/leads o'zi tabli sahifa (ro'yxat +
  // statistika), va `items` qo'shilishi bilan AppSidebar buni
  // ochiladigan guruhga aylantirib, yakka link bo'lmay qolardi.
  // Ikonka `Target` - searchIndex.js dagi "Lidlar" yozuvi bilan bir xil,
  // shunda qidiruvda va menyuda bir xil belgi ko'rinadi.
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
      {
        title: "O'qituvchilar",
        url: "/owner/teachers",
        permission: "users.read",
      },
      // XODIMLAR: ega, o'qituvchilar va custom rollar (direktor, buxgalter,
      // resepshin) bitta ro'yxatda - o'quvchilardan tashqari hamma.
      // Ruxsat GET /users bilan bir xil: aks holda menyuda ko'rinib,
      // ro'yxatning o'zi 403 qaytarardi.
      { title: "Xodimlar", url: "/owner/staff", permission: "users.read" },
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
  // KASSA - qo'sh yozuv jurnali. Moliya bo'limidan ALOHIDA: u
  // "qancha hisoblangan" ni ko'rsatadi, bu esa "qancha PUL BOR" ni.
  {
    title: "Kassa",
    icon: Wallet,
    items: [
      { title: "Qoldiq va smena", url: "/owner/cash-desk", permission: "finance.read" },
    ],
  },

  // KATALOG - kurs (global), xona (filial), narx matritsasi.
  {
    title: "Katalog",
    icon: BookMarked,
    items: [
      { title: "Kurslar va xonalar", url: "/owner/catalog", permission: "courses.read" },
    ],
  },

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
        title: "Tahlil (P&L)",
        url: "/owner/branch-analytics",
        permission: "finance.read",
        // Bitta filialda ham ma'noli: o'z foydasini va anomaliyalarni
        // ko'rsatadi. Shuning uchun allBranchesOnly YO'Q.
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
      {
        title: "Vazifalar",
        url: "/owner/assignments",
        permission: "assignments.read",
      },
      {
        title: "Fayl saqlagich",
        url: "/owner/storage",
        permission: "storage.manage",
      },
      { title: "Feedback", url: "/owner/feedback", permission: "feedback.read" },
    ],
  },

  // AUDIT LOGLARI: alohida yakka link, Sozlamalardan OLDIN.
  //
  // Ilgari Sozlamalar > "Faoliyat loglari" edi. Noto'g'ri joy: Sozlamalar
  // sahifalari biror narsani O'ZGARTIRISH uchun, log esa kim nima
  // qilganini KUZATISH uchun - bu kundalik nazorat ishi, sozlash emas.
  // Xavfsizlik hodisasini tekshirayotgan odam uni sozlamalar ichidan
  // qidirmaydi.
  //
  // Marshrut ham qobiqdan chiqarildi (/owner/activity-logs), aks holda
  // sahifa Sozlamalarning chap ustunli navigatsiyasi bilan ochilib,
  // baribir "alohida bo'lim" bo'lmasdi.
  {
    title: "Audit loglari",
    icon: ScrollText,
    url: "/owner/activity-logs",
    permission: "activity_logs.read",
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
