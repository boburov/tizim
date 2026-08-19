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

/**
 * O'Z moliyaviy tarixim (`/ledger/me`).
 *
 * ── NEGA ALOHIDA HOOK ──
 * Manzil boshqa (`/ledger/me`, `/ledger/:id` emas) va ruxsat modeli
 * ham boshqa: server bu yerda RUXSAT TEKSHIRMAYDI, chunki ID
 * `req.user` dan olinadi va boshqa odamnikini so'rash imkoni yo'q.
 *
 * O'quvchi va o'qituvchi paneli aynan shundan foydalanadi — ularda
 * `finance.read` yo'q va bo'lmasligi ham kerak.
 */
export const useMyLedgerQuery = (options = {}) =>
  useQuery({
    queryKey: qk.ledger.my(),
    queryFn: () => ledgerAPI.my().then((r) => r.data.data),
    ...options,
  });

export default useLedgerQuery;
