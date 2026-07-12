// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API + keys
import { studentFreezeAPI } from "../api/studentFreeze.api";
import { qk } from "@/shared/lib/query/keys";

// Bitta o'quvchining muzlatish tarixi (studentId bo'lmasa - so'rov yubormaydi).
const useStudentFreezesQuery = (studentId) =>
  useQuery({
    queryKey: qk.studentFreezes.byStudent(studentId),
    queryFn: () =>
      studentFreezeAPI.listForStudent(studentId).then((r) => r.data.data),
    enabled: !!studentId,
  });

export default useStudentFreezesQuery;
