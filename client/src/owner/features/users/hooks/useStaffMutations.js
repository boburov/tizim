import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";
import { unwrapApproval, approvalToast } from "@/shared/utils/approvalResponse";

// XODIM (direktor/administrator) yaratish - o'quvchi/o'qituvchidan farqli
// alohida endpoint, chunki roli DINAMIK (custom rollar ham) va filial
// biriktiruvi bilan birga bitta amalda bajariladi.
//
// Tasdiq talab qilinsa server 202 qaytaradi va xodim YARATILMAYDI -
// shunda foydalanuvchilar ro'yxatini yangilash noto'g'ri bo'lardi.
export const useStaffCreateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => http.post(ENDPOINTS.users.staff, body).then(unwrapApproval),
    onSuccess: (res, vars, ctx) => {
      if (res.pendingApproval) qc.invalidateQueries({ queryKey: qk.expenseApprovals.all() });
      else {
        qc.invalidateQueries({ queryKey: qk.users.all() });
        // FILIAL STATISTIKASI HAM ESKIRDI: filial sahifasidagi "Xodimlar"
        // kartochkasi shu so'rovdan oziqlanadi. Bo'lmasa yangi xodim
        // ro'yxatda paydo bo'lardi-yu, ustidagi raqam eski qolardi -
        // ikki son bir-biriga qarama-qarshi ko'rinardi.
        qc.invalidateQueries({ queryKey: qk.branches.all() });
      }
      approvalToast(toast, res, "Xodim qo'shildi");
      options.onSuccess?.(res, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

// Xodimning filial biriktiruvini o'zgartirish.
export const useUserBranchesMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      http.patch(ENDPOINTS.users.branches(id), body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.users.all() });
      toast.success("Filial yangilandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
