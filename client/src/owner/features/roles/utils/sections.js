// Modullarni bo'limlarga guruhlash.
//
// Server /roles/matrix javobida bo'lim maydoni yo'q (faqat module + order),
// shuning uchun guruhlash shu yerda - sidebar tuzilishiga mos ravishda.
// Ro'yxatda yo'q modul "Boshqa" bo'limiga tushadi, ya'ni yangi permission
// qo'shilsa UI baribir ishlaydi (faqat bo'limi aniqlanmagan bo'ladi).

import {
  LayoutDashboard,
  GraduationCap,
  Wallet,
  MessageSquare,
  Settings2,
  Boxes,
} from "lucide-react";

export const SECTIONS = [
  {
    key: "main",
    label: "Asosiy",
    description: "Panel, foydalanuvchilar va lidlar",
    icon: LayoutDashboard,
    modules: ["admin_dashboard", "users", "students", "teachers", "leads"],
  },
  {
    key: "study",
    label: "O'quv jarayoni",
    description: "Guruhlar, davomat va baholash",
    icon: GraduationCap,
    modules: ["groups", "classes", "attendance", "grades", "rating"],
  },
  {
    key: "finance",
    label: "Moliya",
    description: "To'lovlar va maoshlar",
    icon: Wallet,
    modules: ["finance", "salary"],
  },
  {
    key: "comms",
    label: "Muloqot",
    description: "Bildirishnomalar va feedback",
    icon: MessageSquare,
    modules: [
      "notifications",
      "notification_templates",
      "holidays",
      "feedback",
      "feedback_types",
    ],
  },
  {
    key: "system",
    label: "Tizim",
    description: "Rollar, loglar va sozlamalar",
    icon: Settings2,
    modules: ["roles", "activity_logs", "archive_reasons", "system"],
  },
];

const OTHER_SECTION = {
  key: "other",
  label: "Boshqa",
  description: "Bo'limga biriktirilmagan modullar",
  icon: Boxes,
  modules: [],
};

// Modullarni bo'limlarga taqsimlaydi. Bo'sh bo'limlar tushib qoladi.
export const groupModulesBySection = (modules = []) => {
  const byKey = new Map(modules.map((m) => [m.module, m]));
  const used = new Set();

  const sections = SECTIONS.map((section) => {
    const items = section.modules
      .map((key) => {
        const found = byKey.get(key);
        if (found) used.add(key);
        return found;
      })
      .filter(Boolean);
    return { ...section, items };
  }).filter((s) => s.items.length);

  const rest = modules.filter((m) => !used.has(m.module));
  if (rest.length) sections.push({ ...OTHER_SECTION, items: rest });

  return sections;
};

// Qidiruv: modul nomi yoki uning ruxsat nomlari bo'yicha.
export const filterSections = (sections, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return sections;

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((m) => {
        if (m.label.toLowerCase().includes(q)) return true;
        return Object.values(m.cells || {}).some((c) =>
          c.label.toLowerCase().includes(q),
        );
      }),
    }))
    .filter((s) => s.items.length);
};
