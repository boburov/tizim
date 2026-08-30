// React Query
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

// API
import { importAPI } from "@/shared/api/import.api";
import { qk } from "@/shared/lib/query/keys";
import { saveResponseAsFile, readErrorMessage } from "@/shared/utils/downloadFile";

// Hooks
import useFeatures from "@/shared/hooks/useFeatures";

/**
 * Foydalanuvchi ishlata oladigan import turlari + ustun tavsifi.
 *
 * ⚠ TARIFDA IMPORT BO'LMASA SO'ROV UMUMAN YUBORILMAYDI. Usiz har bir
 * ro'yxat sahifasi 402 bilan tugaydigan bekor so'rov qilardi: tugma
 * baribir ko'rinmasdi (`ImportButton` bo'sh ro'yxatda `null` qaytaradi),
 * lekin tarmoq panelida va serverda ma'nosiz shovqin qolardi.
 */
export const useImportersQuery = (options = {}) => {
  const { has, isLoading } = useFeatures();
  const available = !isLoading && has("imports");

  return useQuery({
    queryKey: qk.imports.importers(),
    queryFn: () => importAPI.importers().then((r) => r.data.data),
    staleTime: 30 * 60 * 1000,
    ...options,
    enabled: available && (options.enabled ?? true),
  });
};

/**
 * Tanlov ustunlari uchun variantlar (guruh, filial, rol).
 *
 * Faqat jadval oynasi ochilganda chaqiriladi. Guruhlar ro'yxati import
 * davomida o'zgarmaydi, shuning uchun staleTime uzun.
 */
export const useImportOptionsQuery = (importerKey, options = {}) =>
  useQuery({
    queryKey: qk.imports.options(importerKey),
    queryFn: () => importAPI.options(importerKey).then((r) => r.data.data),
    enabled: Boolean(importerKey),
    staleTime: 10 * 60 * 1000,
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

// ─────────────────────── JADVAL OQIMI ───────────────────────

/**
 * 1-BOSQICH: fayldan tahrirlanadigan qoralama.
 * Server bo'sh maydonlarni to'ldiradi (login, parol, sana, filial) va
 * har qatorni tekshirib qaytaradi.
 */
export const useImportDraftMutation = ({ onProgress, onSuccess } = {}) =>
  useMutation({
    mutationFn: ({ importerKey, file }) =>
      importAPI
        .draft(importerKey, file, (e) => {
          if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
        })
        .then((r) => r.data.data),
    onSuccess,
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Faylni o'qib bo'lmadi"));
    },
  });

/**
 * 2-BOSQICH: tahrirlangan qatorlarni tekshirish.
 *
 * TOAST KO'RSATILMAYDI - bu jonli tekshiruv, foydalanuvchi yozayotganda
 * chaqiriladi. Har harfda xato oynasi chiqsa ishlab bo'lmasdi; xatolar
 * jadvalning O'ZIDA ko'rinadi.
 */
export const useImportValidateRowsMutation = ({ onSuccess } = {}) =>
  useMutation({
    mutationFn: ({ importerKey, rows }) =>
      importAPI.validateRows(importerKey, rows).then((r) => r.data.data),
    onSuccess,
  });

/** 3-BOSQICH: yaratish. Javob 202 bo'lsa - navbatga qo'yildi (jobId). */
export const useImportCreateMutation = ({ onSuccess } = {}) =>
  useMutation({
    mutationFn: ({ importerKey, rows, fileName }) =>
      importAPI.create(importerKey, rows, fileName).then((r) => r.data.data),
    onSuccess,
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Yaratib bo'lmadi"));
    },
  });

/**
 * Fondagi importni kuzatadi.
 *
 * `enabled` faqat jobId bo'lganda. Interval ish TUGAGACH o'chadi -
 * aks holda modal yopilmaguncha har soniyada so'rov ketaverardi.
 */
export const useImportJobQuery = (jobId, options = {}) =>
  useQuery({
    queryKey: qk.imports.job(jobId),
    queryFn: () => importAPI.job(jobId).then((r) => r.data.data),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "completed" || s === "failed" ? false : 1500;
    },
    ...options,
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
