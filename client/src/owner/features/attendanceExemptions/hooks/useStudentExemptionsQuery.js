import { useQuery } from "@tanstack/react-query";
import { attendanceExemptionsAPI } from "../api/attendanceExemptions.api";
import { qk } from "@/shared/lib/query/keys";

const useStudentExemptionsQuery = (studentId) =>
  useQuery({
    queryKey: qk.attendanceExemptions.byStudent(studentId),
    queryFn: () =>
      attendanceExemptionsAPI
        .list({ studentId, limit: 100 })
        .then((r) => r.data),
    enabled: !!studentId,
  });

export default useStudentExemptionsQuery;
