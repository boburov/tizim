import { useQuery } from "@tanstack/react-query";
import { gradesAPI } from "../api/grades.api";
import { qk } from "@/shared/lib/query/keys";

const useGradesForGroupDateQuery = (groupId, date, slot) =>
  useQuery({
    queryKey: qk.grades.byGroupDate(groupId, date, slot || ""),
    queryFn: () =>
      gradesAPI.listForGroupDate(groupId, date, slot).then((r) => r.data.data),
    enabled: !!groupId && !!date,
  });

export default useGradesForGroupDateQuery;
