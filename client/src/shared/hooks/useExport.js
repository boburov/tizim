// React Query
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

// API
import { exportAPI } from "@/shared/api/export.api";
import { qk } from "@/shared/lib/query/keys";
import { saveResponseAsFile, readErrorMessage } from "@/shared/utils/downloadFile";

/**
 * Eksport qilinadigan hisobotlar va ularning ustunlari.
 *
 * Ustunlar SERVER reyestridan keladi - shuning uchun serverga ustun
 * qo'shilsa, client'da hech narsa o'zgartirmasdan paydo bo'ladi.
 * staleTime uzun: reyestr deploy'dan deploy'gacha o'zgarmaydi.
 */
export const useExportDatasetsQuery = (options = {}) =>
  useQuery({
    queryKey: qk.exports.datasets(),
    queryFn: () => exportAPI.datasets().then((r) => r.data.data),
    staleTime: 30 * 60 * 1000,
    ...options,
  });

/**
 * XLSX yuklab olish mutatsiyasi.
 *
 * Muvaffaqiyatda faylni saqlaydi va nechta qator chiqqanini toast'da
 * ko'rsatadi (qatorlar soni X-Export-Rows sarlavhasida keladi - tana
 * binar bo'lgani uchun undan o'qib bo'lmaydi).
 */
export const useExportMutation = ({ onSuccess, onError } = {}) =>
  useMutation({
    mutationFn: ({ datasetKey, columns, filters }) =>
      exportAPI.download(datasetKey, { columns, filters }),
    onSuccess: (response) => {
      saveResponseAsFile(response, "export.xlsx");

      const rows = Number(response.headers?.["x-export-rows"]);
      toast.success(
        Number.isFinite(rows) ? `${rows} ta qator yuklab olindi` : "Fayl yuklab olindi",
      );
      onSuccess?.(response);
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Faylni yuklab bo'lmadi"));
      onError?.(error);
    },
  });
