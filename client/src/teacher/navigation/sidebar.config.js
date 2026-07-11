import { GraduationCap, User, CalendarCheck, Bell, Wallet } from "lucide-react";

const teacherSidebar = [
  {
    title: "O'qituvchi paneli",
    icon: GraduationCap,
    isActive: true,
    items: [
      {
        title: "Mening guruhlarim",
        url: "/teacher/groups",
      },
      {
        title: "Davomat",
        url: "/teacher/attendance",
      },
      {
        title: "Baholash",
        url: "/teacher/grades",
      },
    ],
  },
  {
    title: "Xabarlar",
    icon: Bell,
    isActive: true,
    items: [
      {
        title: "Xabarlarim",
        url: "/teacher/inbox",
      },
      {
        title: "Xabar yuborish",
        url: "/teacher/notifications",
      },
      {
        title: "Feedback",
        url: "/teacher/feedback",
      },
    ],
  },
  {
    title: "Moliya",
    icon: Wallet,
    isActive: true,
    items: [
      {
        title: "Mening oyligim",
        url: "/teacher/finance",
      },
    ],
  },
  {
    title: "Hisob",
    icon: User,
    items: [
      {
        title: "Profil",
        url: "/teacher/profile",
      },
    ],
  },
];

export default teacherSidebar;
