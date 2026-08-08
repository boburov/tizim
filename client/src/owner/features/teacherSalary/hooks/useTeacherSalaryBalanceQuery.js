import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { teacherSalaryAPI } from "../api/teacherSalary.api";

// O'qituvchining JORIY maosh holati: fiksa stavka, bu oygi jami daromad,
// oy boshigacha qoldiq, bu oy shu kungacha ishlangani va jami qoldiq.
//
// `staleTime` qisqa: "bu oy shu kungacha" har kuni o'zgaradi va to'lov
// kiritilgach darhol yangilanishi kerak (mutatsiyalar `teacherSalary`
// prefiksini invalidate qiladi).
const useTeacherSalaryBalanceQuery = (teacherId, options = {}) =>
  useQuery({
    queryKey: qk.teacherSalary.teacherBalance(teacherId),
    queryFn: () =>
      teacherSalaryAPI.salaryBalance(teacherId).then((r) => r.data.data),
    enabled: !!teacherId,
    ...options,
  });

export default useTeacherSalaryBalanceQuery;
