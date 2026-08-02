// React Query
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

// API
import { importAPI } from "@/shared/api/import.api";
import { qk } from "@/shared/lib/query/keys";
import { saveResponseAsFile, readErrorMessage } from "@/shared/utils/downloadFile";

/** Foydalanuvchi ishlata oladigan import turlari + ustun tavsifi. */
export const useImportersQuery = (options = {}) =>
  useQuery({
    queryKey: qk.imports.importers(),
    queryFn: () => importAPI.importers().then((r) => r.data.data),
    staleTime: 30 * 60 * 1000,
    ...options,
  });

/** Import tarixi (kim, qachon, nechta qator). */
export const useImportHistoryQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.imports.history(params),
    queryFn: () => importAPI.history(params).then((r) => r.data),
    ...options,
  });

/** Bo'sh shablonni yuklab olish. */
export const useImportTemplateMutation = () =>
  useMutation({
    mutationFn: (importerKey) => importAPI.template(importerKey),
    onSuccess: (response) => {
      saveResponseAsFile(response, "shablon.xlsx");
      toast.success("Shablon yuklab olindi");
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Shablonni yuklab bo'lmadi"));
    },
  });

/**
 * KO'RIB CHIQISH - fayl tekshiriladi, hech narsa yozilmaydi.
 * onProgress yuklash chizig'i uchun (0-100).
 */
export const useImportPreviewMutation = ({ onProgress, onSuccess } = {}) =>
  useMutation({
    mutationFn: ({ importerKey, file }) =>
      importAPI
        .preview(importerKey, file, (e) => {
          if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
        })
        .then((r) => r.data.data),
    onSuccess,
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Faylni tekshirib bo'lmadi"));
    },
  });

/** TASDIQLASH - to'g'ri qatorlar yoziladi. */
export const useImportCommitMutation = ({ onProgress, onSuccess } = {}) =>
  useMutation({
    mutationFn: ({ importerKey, file }) =>
      importAPI
        .commit(importerKey, file, (e) => {
          if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
        })
        .then((r) => r.data.data),
    onSuccess: (data) => {
      const n = data?.summary?.imported || 0;
      if (n > 0) toast.success(`${n} ta yozuv import qilindi`);
      else toast.warning("Hech qanday yozuv import qilinmadi");
      onSuccess?.(data);
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Importni yakunlab bo'lmadi"));
    },
  });

/** O'tmagan qatorlarni Excel qilib yuklab olish. */
export const useImportErrorReportMutation = () =>
  useMutation({
    mutationFn: ({ importerKey, rows }) => importAPI.errorReport(importerKey, rows),
    onSuccess: (response) => {
      saveResponseAsFile(response, "xatolar.xlsx");
      toast.success("Xatolik hisoboti yuklab olindi");
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Hisobotni yuklab bo'lmadi"));
    },
  });
