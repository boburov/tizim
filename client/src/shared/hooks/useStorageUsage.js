// React Query
import { useQuery } from "@tanstack/react-query";

// API
import { qk } from "@/shared/lib/query/keys";
import { storageAPI } from "@/shared/api/storage.api";

/**
 * Markazning fayl kvotasi.
 *
 * Sidebar indikatori ham, vazifa formasi ham SHU hook'dan oziqlanadi -
 * ikkalasi bir xil raqamni ko'rsatishi kerak. Fayl yuklangach mutatsiya
 * shu kalitni invalidate qiladi (qk.storage.usage()).
 *
 * staleTime 30s: kvota tez-tez o'zgarmaydi, lekin har sahifa almashganda
 * qayta so'rov yuborish ham keraksiz.
 */
export const useStorageUsageQuery = (options = {}) =>
  useQuery({
    queryKey: qk.storage.usage(),
    queryFn: () => storageAPI.usage().then((r) => r.data.data),
    staleTime: 30 * 1000,
    ...options,
  });

/** Baytni odam o'qiydigan ko'rinishga o'giradi ("4.2 MB"). */
export const formatBytes = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};

export default useStorageUsageQuery;
