// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { qk } from "@/shared/lib/query/keys";
import { assignmentsAPI } from "../api/assignments.api";

/** Yuborilgan vazifalar ro'yxati (o'qituvchi - faqat o'ziniki). */
export const useAssignmentsQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.assignments.list(params),
    queryFn: () => assignmentsAPI.list(params).then((r) => r.data),
    ...options,
  });

/** Bitta vazifa. */
export const useAssignmentDetailQuery = (id, options = {}) =>
  useQuery({
    queryKey: qk.assignments.one(id),
    queryFn: () => assignmentsAPI.byId(id).then((r) => r.data.data),
    enabled: Boolean(id),
    ...options,
  });

/** Har bir o'quvchining yetkazish holati. */
export const useAssignmentRecipientsQuery = (id, params, options = {}) =>
  useQuery({
    queryKey: qk.assignments.recipients(id, params),
    queryFn: () => assignmentsAPI.recipients(id, params).then((r) => r.data),
    enabled: Boolean(id),
    ...options,
  });

/**
 * Yuborishdan OLDINGI ko'rib chiqish: nechta o'quvchiga yetadi va
 * nechtasi botni bloklagan.
 *
 * Guruh tanlangandayoq (yuborishdan oldin) chaqiriladi - ogohlantirish
 * o'z vaqtida ko'rinishi uchun. Guruh tanlanmagan bo'lsa so'rov ketmaydi.
 */
export const useAssignmentPreviewQuery = (groupIds = [], options = {}) => {
  // Kalitni barqaror qilamiz: massiv tartibi o'zgarsa ham keshdagi
  // bir xil natija ishlatilsin.
  const sorted = [...groupIds].sort();
  return useQuery({
    queryKey: qk.assignments.preview(sorted),
    queryFn: () => assignmentsAPI.preview(sorted).then((r) => r.data.data),
    enabled: sorted.length > 0,
    ...options,
  });
};

export default useAssignmentsQuery;
