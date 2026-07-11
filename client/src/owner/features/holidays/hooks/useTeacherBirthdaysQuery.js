import { useQuery } from "@tanstack/react-query";
import { holidaysAPI } from "../api/holidays.api";
import { qk } from "@/shared/lib/query/keys";

// O'qituvchilarning yaqinlashib kelayotgan tug'ilgan kunlari (server tartiblab beradi:
// eng yaqinidan eng uzog'igacha). Ro'yxat kunga qarab o'zgaradi.
const useTeacherBirthdaysQuery = () =>
  useQuery({
    queryKey: qk.holidays.teacherBirthdays(),
    queryFn: () => holidaysAPI.teacherBirthdays().then((r) => r.data.data),
  });

export default useTeacherBirthdaysQuery;
