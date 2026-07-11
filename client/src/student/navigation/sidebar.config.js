import { GraduationCap, User, Bell } from "lucide-react";

const studentSidebar = [
  {
    title: "O'quvchi paneli",
    icon: GraduationCap,
    isActive: true,
    items: [
      {
        title: "Mening guruhim",
        url: "/student/group",
      },
      {
        title: "Davomatim",
        url: "/student/attendance",
      },
      {
        title: "Reyting",
        url: "/student/rating",
      },
    ],
  },
  {
    title: "Aloqa",
    icon: Bell,
    isActive: true,
    items: [
      {
        title: "Xabarlarim",
        url: "/student/inbox",
      },
      {
        title: "Feedback",
        url: "/student/feedback",
      },
    ],
  },
  {
    title: "Hisob",
    icon: User,
    items: [
      {
        title: "Profil",
        url: "/student/profile",
      },
    ],
  },
];

export default studentSidebar;
