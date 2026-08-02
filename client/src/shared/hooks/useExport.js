// React Query
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

// API
import { exportAPI } from "@/shared/api/export.api";
import { qk } from "@/shared/lib/query/keys";

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

// Content-Disposition'dan fayl nomini ajratib oladi.
// Server ikkita variant yuboradi: filename="..." (ASCII) va
// filename*=UTF-8''... (to'liq). Ikkinchisi ustun.
const parseFileName = (disposition, fallback) => {
  if (!disposition) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* buzuq kodlash - ASCII variantiga tushamiz */
    }
  }
  const ascii = /filename="?([^";]+)"?/i.exec(disposition);
  return ascii?.[1] || fallback;
};

// Blob'ni brauzerda yuklab olishga majburlaydi.
const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Darhol revoke qilinsa Safari yuklab ulgurmaydi.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Xato javobi ham blob bo'lib keladi (responseType: "blob").
// Ichidagi JSON xabarni o'qiymiz, aks holda foydalanuvchi
// "[object Blob]" ko'radi.
const readBlobError = async (error) => {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {
      /* JSON emas - umumiy xabarga tushamiz */
    }
  }
  return error?.response?.data?.message || "Faylni yuklab bo'lmadi";
};

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
      const fileName = parseFileName(
        response.headers?.["content-disposition"],
        "export.xlsx",
      );
      saveBlob(response.data, fileName);

      const rows = Number(response.headers?.["x-export-rows"]);
      toast.success(
        Number.isFinite(rows) ? `${rows} ta qator yuklab olindi` : "Fayl yuklab olindi",
      );
      onSuccess?.(response);
    },
    onError: async (error) => {
      toast.error(await readBlobError(error));
      onError?.(error);
    },
  });
