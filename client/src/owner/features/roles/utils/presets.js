// Tayyor shablonlar: bir bosishda ruxsatlarning 80% i to'g'ri qo'yiladi,
// qolganini qo'lda aniqlashtiriladi.
//
// Shablon MODUL nomlari bilan ishlaydi (permission id'lari bilan emas) -
// chunki id'lar bazaga bog'liq. Tanlangan daraja access.utils orqali
// haqiqiy id'larga aylantiriladi.

import { Eye, GraduationCap, Wallet, Headset } from "lucide-react";
import { ACCESS_LEVEL, setModuleLevel } from "./access.utils";

export const ROLE_PRESETS = [
  {
    key: "viewer",
    label: "Faqat ko'rish",
    description: "Hamma bo'limni ko'radi, hech narsani o'zgartirmaydi",
    icon: Eye,
    // Barcha modullar - ko'rish darajasida.
    all: ACCESS_LEVEL.READ,
  },
  {
    key: "teacher",
    label: "O'qituvchi kabi",
    description: "Davomat, baho va o'z guruhlari",
    icon: GraduationCap,
    modules: {
      admin_dashboard: ACCESS_LEVEL.READ,
      groups: ACCESS_LEVEL.READ,
      students: ACCESS_LEVEL.READ,
      attendance: ACCESS_LEVEL.FULL,
      grades: ACCESS_LEVEL.FULL,
      rating: ACCESS_LEVEL.READ,
      feedback: ACCESS_LEVEL.READ,
      notifications: ACCESS_LEVEL.READ,
    },
  },
  {
    key: "accountant",
    label: "Buxgalter",
    description: "To'lovlar, qarzlar va maoshlar",
    icon: Wallet,
    modules: {
      admin_dashboard: ACCESS_LEVEL.READ,
      finance: ACCESS_LEVEL.FULL,
      salary: ACCESS_LEVEL.FULL,
      students: ACCESS_LEVEL.READ,
      teachers: ACCESS_LEVEL.READ,
      groups: ACCESS_LEVEL.READ,
    },
  },
  {
    key: "manager",
    label: "Administrator",
    description: "Lidlar, o'quvchilar va guruhlar bilan ishlaydi",
    icon: Headset,
    modules: {
      admin_dashboard: ACCESS_LEVEL.READ,
      leads: ACCESS_LEVEL.FULL,
      students: ACCESS_LEVEL.FULL,
      teachers: ACCESS_LEVEL.READ,
      groups: ACCESS_LEVEL.FULL,
      classes: ACCESS_LEVEL.READ,
      attendance: ACCESS_LEVEL.READ,
      notifications: ACCESS_LEVEL.FULL,
      feedback: ACCESS_LEVEL.FULL,
    },
  },
];

// Shablonni haqiqiy permission id'lariga aylantiradi.
// Shablon "to'ldiruvchi" emas - avvalgi tanlov butunlay almashtiriladi.
export const applyPreset = (preset, modules) =>
  modules.reduce((acc, module) => {
    const level = preset.all || preset.modules?.[module.module];
    if (!level) return acc;
    return setModuleLevel(acc, module, level);
  }, new Set());
