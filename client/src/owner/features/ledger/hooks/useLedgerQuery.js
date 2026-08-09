import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { ledgerAPI } from "../api/ledger.api";

/**
 * Shaxsning moliyaviy tarixi va joriy balansi.
 *
 * Balans SAQLANMAYDI - u har so'rovda manba hujjatlardan qayta
 * hisoblanadi. Shuning uchun kesh muddati qisqa: to'lov kiritilgan
 * zahoti ekrandagi raqam eskirib qoladi.
 */
const useLedgerQuery = (userId, options = {}) =>
  useQuery({
    queryKey: qk.ledger.statement(userId),
    queryFn: () => ledgerAPI.statement(userId).then((r) => r.data.data),
    enabled: !!userId,
    ...options,
  });

export default useLedgerQuery;
