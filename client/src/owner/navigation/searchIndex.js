import {
  Users,
  GraduationCap,
  CalendarCheck,
  Bell,
  ShieldCheck,
  MessageSquare,
  LayoutDashboard,
  Settings,
  BarChart3,
  ListChecks,
  PartyPopper,
  Tags,
  UserCircle2,
  Wallet,
  Target,
  Star,
  Award,
  TrendingDown,
  Archive,
  UserCheck,
  Receipt,
  BadgePercent,
  Banknote,
  Bot,
  FileText,
  AlertTriangle,
} from "lucide-react";

// Bayyina admin panelining barcha qidiriladigan sahifalari.
// title - sahifa nomi (Uzbek)
// description - qisqa tavsif (Uzbek)
// keywords - qidiruv uchun qo'shimcha kalit so'zlar (UZ + EN)
// url - route
// icon - lucide-react komponenti
// category - sidebar guruh nomi (groupedga ishlatamiz)
// permission - RBAC kaliti (yo'q bo'lsa hamma uchun ochiq)
export const SEARCH_INDEX = [
  // ── Asosiy ──────────────────────────────────────────────
  {
    title: "Bosh sahifa",
    description: "Markaz statistikasi va umumiy ko'rsatkichlar",
    keywords: "dashboard, asosiy, overview, statistika, panel, home",
    url: "/owner/dashboard",
    icon: LayoutDashboard,
    category: "Asosiy",
    permission: "admin_dashboard.read",
  },
  {
    title: "AI markaz",
    description: "Kunlik brifing: kecha, bugun, keyin va hozir nima qilish kerak",
    keywords:
      "ai, sun'iy intellekt, brifing, briefing, tahlil, tavsiya, insight, maslahat, operatsiya",
    url: "/owner/ai",
    icon: Bot,
    category: "Asosiy",
    permission: "ai.read",
  },
  {
    title: "AI vazifalar",
    description: "Biznes ta'siri bo'yicha tartiblangan to'liq vazifalar ro'yxati",
    keywords: "ai, vazifa, task, xavf, risk, imkoniyat, opportunity, action center",
    url: "/owner/ai/tasks",
    icon: AlertTriangle,
    category: "Asosiy",
    permission: "ai.read",
  },
  {
    title: "AI hisobotlar",
    description: "Kunlik, haftalik va oylik avtomatik hisobotlar",
    keywords: "ai, hisobot, report, kunlik, haftalik, oylik, daily, weekly, monthly",
    url: "/owner/ai/reports",
    icon: FileText,
    category: "Asosiy",
    permission: "ai.read",
  },
  {
    title: "O'quvchilar",
    description: "O'quvchilar ro'yxati, to'lovlar, qarzdorlar, chegirmalar",
    keywords:
      "users, foydalanuvchi, talaba, student, o'quvchi, hisob, account, to'lov, payment",
    url: "/owner/students",
    icon: Users,
    category: "Asosiy",
    permission: "users.read",
  },
  {
    title: "O'qituvchilar",
    description: "O'qituvchilar ro'yxati, maoshlar, qoldiqlar, davomat",
    keywords:
      "users, foydalanuvchi, o'qituvchi, teacher, hisob, account, maosh, salary",
    url: "/owner/teachers",
    icon: Users,
    category: "Asosiy",
    permission: "users.read",
  },
  {
    title: "Guruhlar",
    description: "Barcha guruhlar ro'yxati, yangi guruh ochish, tahrirlash",
    keywords: "guruh, groups, sinflar, classes, kurs, course, dars jadvali",
    url: "/owner/groups",
    icon: GraduationCap,
    category: "Asosiy",
    permission: "groups.read",
  },
  {
    title: "O'quvchilar statistikasi",
    description: "O'quvchilar bo'yicha umumiy tahlil va ko'rsatkichlar",
    keywords:
      "statistika, stats, o'quvchi, student, tahlil, analytics, hisobot, dashboard",
    url: "/owner/students/statistika",
    icon: BarChart3,
    category: "Asosiy",
    permission: "admin_dashboard.read",
  },
  {
    title: "Chiqib ketish tahlili",
    description: "O'quvchilar chiqib ketishi (retention) tahlili",
    keywords:
      "retention, chiqib ketish, ketgan, tahlil, churn, ushlab qolish, o'quvchi",
    url: "/owner/students/chiqib-ketish",
    icon: TrendingDown,
    category: "Asosiy",
    permission: "admin_dashboard.read",
  },
  {
    title: "Arxiv sabablari",
    description: "O'quvchilarni arxivlash sabablari va hisoboti",
    keywords:
      "arxiv, archive, sabab, reason, chiqarish, o'chirish, hisobot, report",
    url: "/owner/settings/arxiv-sabablari",
    icon: Archive,
    category: "Asosiy",
    permission: "archive_reasons.manage",
  },

  // ── Moliya ──────────────────────────────────────────────
  {
    title: "O'qituvchi maoshlari",
    description: "O'qituvchilar maoshi, qoldiqlar, maosh belgilash",
    keywords:
      "maosh, salary, o'qituvchi, teacher, qoldiq, oylik, to'lov, payment",
    url: "/owner/teachers/maoshlar",
    icon: Banknote,
    category: "Moliya",
    permission: "salary.read",
  },
  {
    title: "O'quvchi to'lovlari",
    description: "O'quvchilarning to'lovlari va qarzdorlar",
    keywords:
      "to'lov, payment, o'quvchi, student, qarz, debtor, qarzdor, moliya, finance",
    url: "/owner/students/tolovlar",
    icon: Wallet,
    category: "Moliya",
    permission: "finance.read",
  },
  {
    title: "Guruh to'lovi",
    description: "Guruhlar narxi va to'lov shartlari",
    keywords:
      "guruh to'lovi, group fee, narx, price, oylik, tarif, moliya, finance",
    url: "/owner/groups/tolov",
    icon: Receipt,
    category: "Moliya",
    permission: "finance.read",
  },
  {
    title: "Chegirmalar",
    description: "O'quvchilarga beriladigan chegirmalar",
    keywords:
      "chegirma, discount, skidka, imtiyoz, narx, moliya, finance",
    url: "/owner/students/chegirmalar",
    icon: BadgePercent,
    category: "Moliya",
    permission: "finance.read",
  },

  // ── Lidlar ──────────────────────────────────────────────
  {
    title: "Lidlar ro'yxati",
    description: "Potensial mijozlar (lid) ro'yxati va holati",
    keywords:
      "lid, lead, mijoz, crm, potensial, qiziquvchi, ariza, ro'yxat",
    url: "/owner/leads",
    icon: Target,
    category: "Lidlar",
    permission: "leads.read",
  },
  {
    title: "Lidlar statistikasi",
    description: "Lidlar bo'yicha statistika va konversiya",
    keywords:
      "lid, lead, statistika, stats, konversiya, conversion, hisobot, crm",
    url: "/owner/leads/statistika",
    icon: BarChart3,
    category: "Lidlar",
    permission: "leads.read",
  },
  {
    title: "Lid sozlamalari",
    description: "Manba, yo'nalish va rad etish sabablari",
    keywords:
      "lid, lead, sozlama, settings, manba, source, yo'nalish, direction, rad etish, rejection",
    url: "/owner/settings/lidlar",
    icon: Settings,
    category: "Lidlar",
    permission: "leads.manage",
  },

  // ── Davomat ─────────────────────────────────────────────
  {
    title: "Davomat belgilash",
    description: "Tanlangan guruhga kunlik davomatni qayd etish",
    keywords:
      "davomat, attendance, mark, belgilash, kelmadi, keldi, kechikdi, sababli, ozod",
    url: "/owner/attendance/mark",
    icon: ListChecks,
    category: "Davomat",
    permission: "attendance.record",
  },
  {
    title: "O'qituvchilar davomati",
    description: "O'qituvchilarning kunlik davomatini qayd etish",
    keywords:
      "davomat, attendance, o'qituvchi, teacher, kelmadi, keldi, belgilash",
    url: "/owner/teachers/davomat",
    icon: UserCheck,
    category: "Davomat",
    permission: "attendance.record",
  },
  {
    title: "Davomat hisobotlari",
    description: "Davomat statistikasi, past davomatlilar, guruh bo'yicha hisobot",
    keywords:
      "davomat, attendance, report, hisobot, statistika, foiz, percent, dashboard",
    url: "/owner/attendance",
    icon: CalendarCheck,
    category: "Davomat",
    permission: "attendance.read",
  },
  {
    title: "Davomat sozlamalari",
    description: "Past davomat chegarasi, ketma-ket kelmaslik ogohlantirishi",
    keywords: "davomat, sozlama, settings, threshold, chegara, konfiguratsiya",
    url: "/owner/settings/davomat",
    icon: Settings,
    category: "Davomat",
    permission: "attendance.manage",
  },

  // ── Baholash ────────────────────────────────────────────
  {
    title: "Baholash",
    description: "O'quvchilarga baho qo'yish",
    keywords:
      "baho, baholash, grade, grades, ball, score, qo'yish, record",
    url: "/owner/grades",
    icon: Award,
    category: "Baholash",
    permission: "grades.record",
  },
  {
    title: "Reyting",
    description: "O'quvchilar reytingi (leaderboard)",
    keywords:
      "reyting, rating, leaderboard, top, ball, ko'rsatkich, raqobat",
    url: "/owner/grades/reyting",
    icon: Star,
    category: "Baholash",
    permission: "rating.read",
  },
  {
    title: "Reyting sozlamalari",
    description: "Reyting hisoblash mezonlari va sozlamalari",
    keywords:
      "reyting, rating, sozlama, settings, mezon, koeffitsiyent, konfiguratsiya",
    url: "/owner/settings/reyting",
    icon: Settings,
    category: "Baholash",
    permission: "rating.manage",
  },

  // ── Bildirishnomalar ────────────────────────────────────
  {
    title: "Xabarlar",
    description: "Yuborilgan bildirishnomalar tarixi va statusi",
    keywords:
      "xabar, message, notification, bildirishnoma, sms, telegram, broadcast",
    url: "/owner/notifications",
    icon: Bell,
    category: "Bildirishnomalar",
    permission: "notifications.read",
  },
  {
    title: "Bildirishnoma shablonlari",
    description: "Tayyor xabar matnlari (qarz, bayram, e'lon)",
    keywords:
      "shablon, template, bildirishnoma, notification, qarz, bayram, e'lon, announcement",
    url: "/owner/settings/shablonlar",
    icon: ListChecks,
    category: "Bildirishnomalar",
    permission: "notification_templates.manage",
  },
  {
    title: "Bayramlar",
    description: "Bayram va dam olish kunlari (avtomatik tabriklar)",
    keywords:
      "bayram, holiday, ta'til, dam olish, tabrik, navruz, mustaqillik",
    url: "/owner/settings/bayramlar",
    icon: PartyPopper,
    category: "Bildirishnomalar",
    permission: "holidays.manage",
  },

  // ── Feedback ────────────────────────────────────────────
  {
    title: "Feedback",
    description: "Foydalanuvchilardan kelgan fikr-mulohazalar",
    keywords:
      "feedback, fikr, mulohaza, shikoyat, taklif, complaint, review, opinion",
    url: "/owner/feedback",
    icon: MessageSquare,
    category: "Feedback",
    permission: "feedback.read",
  },
  {
    title: "Feedback hisobotlari",
    description: "Murojaat turlari, javob beruvchi, status statistikasi",
    keywords: "feedback, hisobot, report, statistika, dashboard",
    url: "/owner/feedback/hisobot",
    icon: BarChart3,
    category: "Feedback",
    permission: "feedback.read",
  },
  {
    title: "Feedback turlari",
    description: "Murojaat kategoriyalarini boshqarish",
    keywords: "feedback, turlari, kategoriya, type, taklif, shikoyat",
    url: "/owner/settings/feedback-turlari",
    icon: Tags,
    category: "Feedback",
    permission: "feedback_types.manage",
  },

  // ── Tizim ───────────────────────────────────────────────
  {
    title: "Ega profili",
    description: "Shaxsiy ma'lumotlar va parolni o'zgartirish",
    keywords: "profil, profile, hisob, account, parol, password, sozlamalar, ega",
    url: "/owner/settings",
    icon: UserCircle2,
    category: "Tizim",
  },
  {
    title: "Faoliyat loglari",
    description: "Tizimdagi yozish/o'zgartirish/o'chirish amallari tarixi",
    keywords:
      "audit, faoliyat, log, activity, tarix, history, security, kim, qachon",
    url: "/owner/settings/loglar",
    icon: ShieldCheck,
    category: "Tizim",
    permission: "activity_logs.read",
  },
];

// Bitta yozuvni qidiruv matniga to'g'rilash uchun katlangan stringi
export const buildSearchHaystack = (item) =>
  `${item.title} ${item.description} ${item.keywords} ${item.category}`.toLowerCase();
