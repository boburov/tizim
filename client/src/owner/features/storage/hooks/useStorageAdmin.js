// TanStack Query
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// API
import { qk } from "@/shared/lib/query/keys";
import { storageAdminAPI } from "../api/storage.api";
import { readErrorMessage } from "@/shared/utils/downloadFile";

/** Tozalash siyosati + kvota holati (bitta so'rovda). */
export const useStorageSettingsQuery = (options = {}) =>
  useQuery({
    queryKey: qk.storage.settings(),
    queryFn: () => storageAdminAPI.settings().then((r) => r.data.data),
    ...options,
  });

/** Saqlagichdagi fayllar - standart tartib: kattasidan kichigiga. */
export const useStorageFilesQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.storage.files(params),
    queryFn: () => storageAdminAPI.files(params).then((r) => r.data),
    ...options,
  });

export const useUpdateStorageSettingsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      storageAdminAPI.updateSettings(body).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.storage.all() });
      toast.success("Tozalash sozlamalari saqlandi");
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Sozlamani saqlab bo'lmadi"));
    },
  });
};

/**
 * "Nima o'chadi" - hech narsa o'chirmaydi.
 *
 * Tasdiqlash oynasi shu raqamni ko'rsatadi: "23 ta fayl, 340 MB" degani
 * "davom etasizmi?" degan savolni ma'noli qiladi. Raqamsiz tasdiqlash
 * shunchaki bir qo'shimcha bosish bo'lardi.
 */
export const useCleanupPreviewMutation = () =>
  useMutation({
    mutationFn: (body) =>
      storageAdminAPI.cleanupPreview(body).then((r) => r.data.data),
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Hisoblab bo'lmadi"));
    },
  });

export const useCleanupMutation = ({ onSuccess } = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => storageAdminAPI.cleanup(body).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: qk.storage.all() });
      // Vazifalar ham yangilanadi: tozalangan fayl ularda "o'chirilgan"
      // bo'lib ko'rinishi kerak.
      queryClient.invalidateQueries({ queryKey: qk.assignments.all() });
      toast.success(res?.message || "Tozalash bajarildi");
      onSuccess?.(res?.data);
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Tozalab bo'lmadi"));
    },
  });
};

export const useRemoveStoredFileMutation = ({ onSuccess } = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => storageAdminAPI.removeFile(id).then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: qk.storage.all() });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all() });
      toast.success("Fayl o'chirildi");
      onSuccess?.(data);
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Faylni o'chirib bo'lmadi"));
    },
  });
};
