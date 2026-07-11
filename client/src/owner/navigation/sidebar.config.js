import {
  CalendarCheck,
  Bell,
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
      {
        title: "Foydalanuvchilar",
        url: "/owner/users",
        permission: "users.read",
      },
      {
        title: "Guruhlar",
        url: "/owner/groups",
        permission: "groups.read",
      },
      {
        title: "O'quvchilar statistikasi",
        url: "/owner/students/stats",
        permission: "admin_dashboard.read",
      },
      {
        title: "Chiqib ketish tahlili",
        url: "/owner/students/retention",
        permission: "admin_dashboard.read",
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
      {
        title: "O'qituvchi maoshlari",
        url: "/owner/finance/teacher-salaries",
        permission: "salary.read",
      },
      {
        title: "O'quvchi to'lovlari",
        url: "/owner/finance/student-payments",
        permission: "finance.read",
      },
      {
        title: "Depozitlar",
        url: "/owner/finance/deposits",
        permission: "finance.read",
      },
      {
        title: "Guruh to'lovi",
        url: "/owner/finance/group-fees",
        permission: "finance.read",
      },
      {
        title: "Chegirmalar",
        url: "/owner/finance/discounts",
        permission: "finance.read",
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
      {
        title: "O'qituvchilar",
        url: "/owner/attendance/teachers",
        permission: "attendance.record",
      },
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
      {
        title: "Faoliyat loglari",
        url: "/owner/activity-logs",
        permission: "activity_logs.read",
      },
    ],
  },
];

export default ownerSidebar;
