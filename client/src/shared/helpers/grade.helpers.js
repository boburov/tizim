// ─── Baho rang/label tokenlari (yagona manba) ───
// Baholash moduli bo'ylab bir xil ranglar shu yerdan keladi. Har bahoga:
//  - soft: yumshoq fon (tanlangan tugma, badge) - fon + matn + chegara
//  - solid: to'q to'ldirilgan variant (progress, podium aksenti)
//  - dot: nuqta/indikator rangi
//  - ring: focus/active halqa rangi
// label - default nom; sozlamalarda foydalanuvchi uni qayta yozishi mumkin.
export const MAX_GRADE = 5;

export const GRADE_TOKENS = {
  5: {
    soft: "bg-green-100 text-green-800 border-green-300",
    solid: "bg-green-500 text-white border-green-500",
    dot: "bg-green-500",
    ring: "ring-green-400",
    label: "A'lo",
  },
  4: {
    soft: "bg-blue-100 text-blue-800 border-blue-300",
    solid: "bg-blue-500 text-white border-blue-500",
    dot: "bg-blue-500",
    ring: "ring-blue-400",
    label: "Yaxshi",
  },
  3: {
    soft: "bg-yellow-100 text-yellow-800 border-yellow-300",
    solid: "bg-yellow-400 text-yellow-950 border-yellow-400",
    dot: "bg-yellow-400",
    ring: "ring-yellow-400",
    label: "Qoniqarli",
  },
  2: {
    soft: "bg-orange-100 text-orange-800 border-orange-300",
    solid: "bg-orange-500 text-white border-orange-500",
    dot: "bg-orange-500",
    ring: "ring-orange-400",
    label: "Bo'sh",
  },
  1: {
    soft: "bg-red-100 text-red-800 border-red-300",
    solid: "bg-red-500 text-white border-red-500",
    dot: "bg-red-500",
    ring: "ring-red-400",
    label: "Yomon",
  },
};

const FALLBACK_TOKEN = {
  soft: "bg-gray-100 text-gray-700 border-gray-300",
  solid: "bg-gray-400 text-white border-gray-400",
  dot: "bg-gray-400",
  ring: "ring-gray-400",
  label: "",
};

export const getGradeToken = (grade) => GRADE_TOKENS[grade] || FALLBACK_TOKEN;

// Default baho labellari (sozlamalar formasini boshlang'ich to'ldirish uchun).
export const defaultGradeLabels = () =>
  Object.fromEntries(
    Object.entries(GRADE_TOKENS).map(([k, v]) => [k, v.label]),
  );

// Eski API saqlanadi (boshqa joylarda ishlatiladi) - endi token jadvalidan.
export const getGradeColor = (grade) => getGradeToken(grade).soft;

export const calculateAverageGrade = (grades) => {
  if (grades.length === 0) return 0;
  const sum = grades.reduce((acc, g) => acc + g.grade, 0);
  return (sum / grades.length).toFixed(2);
};

export const getGradeForSubject = (
  studentGrades,
  subjectId,
  occurrenceIndex = 0,
) => {
  if (!subjectId || subjectId === "all") return null;

  // Sort by lessonOrder so occurrenceIndex maps to the Nth lesson chronologically
  const subjectGrades = studentGrades
    .filter(
      (g) =>
        g.subject &&
        g.subject._id &&
        g.subject._id.toString() === subjectId.toString(),
    )
    .sort((a, b) => (a.lessonOrder || 0) - (b.lessonOrder || 0));

  if (subjectGrades.length === 0) return null;

  return subjectGrades[occurrenceIndex] || null;
};
