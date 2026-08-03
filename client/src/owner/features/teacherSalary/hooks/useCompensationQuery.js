// TanStack Query
import { useQuery } from "@tanstack/react-query";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// API
import { teacherSalaryAPI } from "../api/teacherSalary.api";

/**
 * O'qituvchining maosh stavkasi: TARIX (items) + hozir amaldagisi (active).
 * teacherId bo'lmasa so'rov yuborilmaydi (yangi yaratilayotgan o'qituvchi).
 */
const useCompensationQuery = (teacherId) =>
  useQuery({
    queryKey: qk.teacherSalary.compensations(teacherId),
    queryFn: () =>
      teacherSalaryAPI.compensations(teacherId).then((r) => r.data.data),
    enabled: Boolean(teacherId),
  });

export default useCompensationQuery;
