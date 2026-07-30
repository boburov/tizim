import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { aiAPI } from "../api/ai.api";

// BRIFING - operatsiyalar markazining yagona so'rovi.
//
// staleTime 5 daqiqa: brifing tungi/kunduzgi joblar yozgan ma'lumotdan
// quriladi va ular eng tez-tez har 3 soatda ishlaydi. Har fokusda qayta
// so'rash server yuklamasini bekorga oshirardi - ma'lumot o'zgarmaydi.
const useBriefingQuery = (params) =>
  useQuery({
    queryKey: qk.ai.briefing(params),
    queryFn: () => aiAPI.briefing(params).then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

export default useBriefingQuery;
