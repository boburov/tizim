import { StudentAssignmentsBadge } from "@/student/features/assignments";

/**
 * Menyu qatoridagi nishon (badge) reyestri.
 *
 * Sidebar konfiguratsiyasi SOF ma'lumot bo'lib qolishi kerak (u oddiy
 * massiv, komponent emas), shuning uchun yozuvda faqat `badge: "kalit"`
 * turadi va komponent shu yerda tanlanadi. Aks holda navigatsiya fayli
 * hook va so'rovlarga bog'lanib ketardi.
 *
 * Har bir nishon O'ZI so'rov qiladi va o'zi yashiradi - shartli hook
 * chaqiruvi bo'lmasin.
 */
const REGISTRY = {
  studentAssignments: StudentAssignmentsBadge,
};

const SidebarItemBadge = ({ kind }) => {
  const Badge = REGISTRY[kind];
  return Badge ? <Badge /> : null;
};

export default SidebarItemBadge;
