import {
  CalendarCheck,
  Bell,
  BadgeCheck,
  Building2,
  MessageSquare,
  LayoutDashboard,
  MonitorCog,
  Star,
  Target,
  Wallet,
} from "lucide-react";

const ownerSidebar = [
  {
    title: "Asosiy",
    icon: LayoutDashboard,
    isActive: true,
    items: [
      {
        title: "Bosh sahifa",
        url: "/owner/dashboard",
        permission: "admin_dashboard.read",
      },
      // SUBYEKT BO'YICHA GURUHLASH: o'quvchiga tegishli hamma narsa (to'lov,
      // qarzdorlik, chegirma, statistika) o'quvchilar sahifasining tabi;
      // o'qituvchiniki (maosh, qoldiq, davomat) - o'qituvchilar sahifasida.
      // Shuning uchun bu yerda har bir subyekt bitta link.
      {
        title: "O'quvchilar",
        url: "/owner/students",
        permission: "users.read",
      },
      {
        title: "O'qituvchilar",
        url: "/owner/teachers",
        permission: "users.read",
      },
      {
        title: "Guruhlar",
        url: "/owner/groups",
        permission: "groups.read",
      },
      {
        title: "Arxiv sabablari",
        url: "/owner/archive-reasons",
        permission: "archive_reasons.manage",
      },
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
      // Maosh -> O'qituvchilar, to'lov/qarzdorlik/chegirma -> O'quvchilar,
      // guruh to'lovi -> Guruhlar sahifasiga ko'chdi. Bu yerda faqat
      // subyektga bog'lanmagan umumiy moliya qoladi.
      {
        title: "To'lovlar",
        url: "/owner/finance/deposits",
        permission: "finance.read",
      },
    ],
  },

  // TASDIQLAR - ataylab YAKKA link (`items` yo'q, `url` bor).
  // Moliya guruhidan chiqarildi: so'rovlar chiqim ham, sozlama ham, ishga
  // olish ham bo'lgani uchun u faqat moliya bo'limi emas. Bitta sahifa
  // bo'lgani uchun ochiladigan guruh ortiqcha bosish qadamini qo'shardi.
  {
    title: "Tasdiqlar",
    icon: BadgeCheck,
    url: "/owner/expense-approvals",
    badge: "approvals",
    permissionAnyOf: ["finance.read", "approvals.decide_config"],
  },

  {
    title: "Filiallar",
    icon: Building2,
    isActive: false,
    items: [
      {
        title: "Ro'yxat",
        url: "/owner/branches",
        permission: "branches.read",
      },
      {
        title: "Taqqoslash",
        url: "/owner/branches/compare",
        permission: "branches.read",
      },
      {
        title: "Statistika",
        url: "/owner/branches/stats",
        permission: "branches.read",
      },
      {
        // Chiqim tasdiq limiti (expenseApprovalThreshold) - ilgari faqat
        // filialni tahrirlash modalida edi, ya'ni "qaysi filialda limit
        // qancha" degan savolga javob berish uchun har birini ochish kerak edi.
        title: "Limitlar",
        url: "/owner/branches/limits",
        permission: "branches.update",
      },
    ],
  },

  {
    title: "Lidlar",
    icon: Target,
    isActive: false,
    items: [
      {
        title: "Ro'yxatlar",
        url: "/owner/leads",
        permission: "leads.read",
      },
      {
        title: "Statistika",
        url: "/owner/leads/stats",
        permission: "leads.read",
      },
      {
        title: "Sozlamalar",
        url: "/owner/leads/settings",
        permission: "leads.manage",
      },
    ],
  },

  {
    title: "Davomat",
    icon: CalendarCheck,
    isActive: false,
    items: [
      {
        title: "Belgilash",
        url: "/owner/attendance/mark",
        permission: "attendance.record",
      },
      // O'qituvchilar davomati -> O'qituvchilar sahifasining tabi.
      {
        title: "Hisobotlar",
        url: "/owner/attendance",
        permission: "attendance.read",
      },
      {
        title: "Sozlamalar",
        url: "/owner/settings/attendance",
        permission: "attendance.manage",
      },
    ],
  },
  {
    title: "Baholash",
    icon: Star,
    isActive: false,
    items: [
      {
        title: "Baholash",
        url: "/owner/grades",
        permission: "grades.record",
      },
      {
        title: "Reyting",
        url: "/owner/rating",
        permission: "rating.read",
      },
      {
        title: "Sozlamalar",
        url: "/owner/settings/rating",
        permission: "rating.manage",
      },
    ],
  },

  {
    title: "Bildirishnomalar",
    icon: Bell,
    isActive: false,
    items: [
      {
        title: "Xabarlar",
        url: "/owner/notifications",
        permission: "notifications.read",
      },
      {
        title: "Shablonlar",
        url: "/owner/notification-templates",
        permission: "notification_templates.manage",
      },
      {
        title: "Bayramlar",
        url: "/owner/holidays",
        permission: "holidays.manage",
      },
    ],
  },

  {
    title: "Feedback",
    icon: MessageSquare,
    isActive: false,
    items: [
      {
        title: "Asosiy",
        url: "/owner/feedback",
        permission: "feedback.read",
      },
      {
        title: "Hisobotlar",
        url: "/owner/feedback/dashboard",
        permission: "feedback.read",
      },
      {
        title: "Turlari",
        url: "/owner/feedback-types",
        permission: "feedback_types.manage",
      },
    ],
  },

  {
    title: "Tizim",
    icon: MonitorCog,
    items: [
      {
        title: "Ega profili",
        url: "/owner/profile",
      },
      // "Filiallar" bu yerdan o'zining top-level bo'limiga ko'chdi.
      {
        title: "Rollar va ruxsatlar",
        url: "/owner/roles",
        permission: "roles.read",
      },
      {
        title: "Faoliyat loglari",
        url: "/owner/activity-logs",
        permission: "activity_logs.read",
      },
    ],
  },
];

export default ownerSidebar;
