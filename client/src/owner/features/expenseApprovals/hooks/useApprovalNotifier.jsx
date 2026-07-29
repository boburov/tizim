// React
import { useEffect, useRef } from "react";

// Toast
import { toast } from "sonner";

// Hooks
import useExpenseApprovalsQuery from "./useExpenseApprovalsQuery";

// Components
import ApprovalToastCard from "../components/ApprovalToastCard";

// Kutilayotganlar oqimi uchun kichik oyna - bildirishnoma faqat YANGI
// kelganlar uchun chiqadi, butun ro'yxat kerak emas.
const FEED_PARAMS = { status: "pending", limit: 20, sort: "-createdAt" };

/**
 * Yangi tasdiq so'rovlarini yonboshdan chiqadigan karta sifatida ko'rsatadi.
 *
 * BIRINCHI YUKLASHDA JIM: mavjud so'rovlar "ko'rilgan" deb belgilanadi va
 * toast chiqmaydi. Aks holda 12 ta kutilayotgan so'rovi bor administrator
 * har sahifa yangilanishida 12 ta oyna bilan ko'milardi - "yangi" degani
 * "shu sessiyada paydo bo'ldi" degani.
 *
 * DIQQAT: bu hook ILOVADA BIR MARTA mount qilinishi kerak (ApprovalNotifier).
 * Ikki joyda chaqirilsa har bir so'rov ikki marta toast bo'lardi.
 */
const useApprovalNotifier = ({ enabled = true, onOpenDetail } = {}) => {
  const seenRef = useRef(new Set());
  const seededRef = useRef(false);

  const { data } = useExpenseApprovalsQuery(FEED_PARAMS, { enabled });

  // Callback'ni ref'da saqlaymiz: uni effect bog'liqligiga qo'shsak,
  // har renderda yangi funksiya kelib effect qayta ishga tushardi.
  const detailRef = useRef(onOpenDetail);
  useEffect(() => {
    detailRef.current = onOpenDetail;
  }, [onOpenDetail]);

  useEffect(() => {
    if (!enabled) return;
    const items = data?.data;
    if (!items) return;

    if (!seededRef.current) {
      items.forEach((a) => seenRef.current.add(a._id));
      seededRef.current = true;
      return;
    }

    // Eng eskisidan boshlab ko'rsatamiz - toastlar ustma-ust chiqqanda
    // eng yangisi tepada turadi.
    [...items].reverse().forEach((approval) => {
      if (seenRef.current.has(approval._id)) return;
      seenRef.current.add(approval._id);

      toast.custom(
        (id) => (
          <ApprovalToastCard
            approval={approval}
            onClose={() => toast.dismiss(id)}
            onOpenDetail={(a) => {
              toast.dismiss(id);
              detailRef.current?.(a);
            }}
          />
        ),
        // Pul bilan bog'liq qaror - o'zi yo'qolib qolmasligi kerak.
        { duration: Infinity, id: `approval:${approval._id}` },
      );
    });
  }, [data, enabled]);
};

export default useApprovalNotifier;
