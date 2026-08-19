/**
 * Drill-down subyektini TAHLIL FILTRIGA aylantiradi.
 *
 * Shu tufayli panel ichidagi raqamlar tashqi jadvaldagi raqam bilan
 * MOS keladi: ikkalasi ham bir xil endpoint'ni, faqat qo'shimcha
 * o'lchov filtri bilan chaqiradi. Panel o'zi hech narsa hisoblamaydi.
 */
const MAP = {
  teacher: "teacherId",
  course: "courseId",
  group: "groupId",
  room: "roomId",
  student: "studentId",
  expenseCategory: "expenseCategoryId",
  paymentMethod: "paymentMethod",
};

export const targetFilter = (target) => {
  if (!target) return {};
  const key = MAP[target.type];
  return key ? { [key]: target.id } : {};
};

export default targetFilter;
