// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const exportAPI = {
  // Foydalanuvchi eksport qila oladigan hisobotlar + ustunlar.
  datasets: () => http.get(ENDPOINTS.exports.datasets),

  // XLSX yuklab olish.
  //
  // responseType "blob" - javob binar fayl. DIQQAT: xato bo'lganda ham
  // javob blob bo'lib keladi (server JSON qaytargan bo'lsa ham), shuning
  // uchun xato matnini o'qish uchun blobni JSON'ga qaytarish kerak -
  // buni useExportMutation qiladi.
  download: (datasetKey, { columns, filters }) =>
    http.post(
      ENDPOINTS.exports.download(datasetKey),
      { columns, filters },
      { responseType: "blob" },
    ),
};
