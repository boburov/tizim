// Frontend-only baholash sozlamalari (localStorage).
// MUHIM: hozircha backend faqat gradeWeight/attendanceWeight'ni saqlaydi
// (rating settings). Quyidagi qo'shimcha sozlamalar (baho labellari, reyting
// davri, top-N, kechikish hisobi, avtomatlashtirish) shu yerda - localStorage'da
// saqlanadi. Backend tayyor bo'lganda shu defaultlar serverga ko'chiriladi.
import { defaultGradeLabels } from "@/shared/helpers/grade.helpers";

const STORAGE_KEY = "bayyina:grading-settings:v1";

// Eslatma: vazn (gradeWeight/attendanceWeight) BU YERDA yo'q - ular serverda.
export const DEFAULT_GRADING_SETTINGS = Object.freeze({
  // Baho shkalasi - 5 ballik (tanlovsiz), faqat labellar tahrirlanadi.
  gradeLabels: defaultGradeLabels(), // { 1: "Yomon", ... 5: "A'lo" }

  // Reyting
  ratingPeriod: "monthly", // "daily" | "weekly" | "monthly" | "range"
  ratingTopN: 10, // reytingda nechta top o'quvchi ko'rsatilsin
  countLateAsAbsent: false, // davomat foizida kechikish "kelmagan" deb hisoblanadimi

  // Avtomatlashtirish
  autoRemindUngraded: false, // baholanmagan o'quvchilar uchun avto-eslatma
  notifyParents: false, // natijani ota-onaga bildirishnoma orqali yuborish
  notifyStudents: false, // natijani o'quvchiga bildirishnoma orqali yuborish
});

export const RATING_PERIODS = [
  { value: "daily", label: "Kunlik" },
  { value: "weekly", label: "Haftalik" },
  { value: "monthly", label: "Oylik" },
  { value: "range", label: "Sana diapazoni" },
];

export const TOP_N_OPTIONS = [
  { value: 5, label: "Top 5" },
  { value: 10, label: "Top 10" },
  { value: 20, label: "Top 20" },
  { value: 50, label: "Top 50" },
  { value: 100, label: "Hammasi (100)" },
];

// localStorage'dan o'qish - buzilgan/eski bo'lsa defaultga qaytadi, har doim
// defaults bilan birlashtiriladi (kelajakda yangi maydon qo'shilsa ham ishlaydi).
export const loadGradingSettings = () => {
  try {
    const raw =
      typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRADING_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_GRADING_SETTINGS,
      ...parsed,
      gradeLabels: {
        ...DEFAULT_GRADING_SETTINGS.gradeLabels,
        ...(parsed.gradeLabels || {}),
      },
    };
  } catch {
    return { ...DEFAULT_GRADING_SETTINGS };
  }
};

export const saveGradingSettings = (settings) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage yo'q yoki to'lgan - jim o'tamiz */
  }
};
