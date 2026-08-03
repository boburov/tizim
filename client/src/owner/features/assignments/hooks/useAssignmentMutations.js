// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// API
import { qk } from "@/shared/lib/query/keys";
import { assignmentsAPI } from "../api/assignments.api";
import { saveResponseAsFile, readErrorMessage } from "@/shared/utils/downloadFile";

/**
 * Vazifa yuborish.
 *
 * Muvaffaqiyatdan keyin KVOTA keshi ham tozalanadi: fayl diskka yozildi,
 * ya'ni sidebar'dagi raqam eskirdi. Buni unutish indikatorni yolg'onchi
 * qilardi - foydalanuvchi "joy bor" deb turib, keyingi yuklashda rad
 * javobini olardi.
 */
export const useSendAssignmentMutation = ({ onProgress, onSuccess } = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) =>
      assignmentsAPI
        .create(payload, (e) => {
          if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
        })
        .then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.all() });
      queryClient.invalidateQueries({ queryKey: qk.storage.usage() });
      toast.success(`Vazifa ${data?.recipientsCount || 0} ta o'quvchiga yuborildi`);
      onSuccess?.(data);
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Vazifani yuborib bo'lmadi"));
    },
  });
};

/** Vazifani o'chirish - fayl diskdan ketadi, joy bo'shaydi. */
export const useDeleteAssignmentMutation = ({ onSuccess } = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => assignmentsAPI.remove(id).then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.all() });
      queryClient.invalidateQueries({ queryKey: qk.storage.usage() });
      toast.success("Vazifa o'chirildi, joy bo'shatildi");
      onSuccess?.(data);
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Vazifani o'chirib bo'lmadi"));
    },
  });
};

/** Biriktirmani yuklab olish. */
export const useDownloadAttachmentMutation = () =>
  useMutation({
    mutationFn: ({ id }) => assignmentsAPI.download(id),
    onSuccess: (response, variables) => {
      saveResponseAsFile(response, variables?.fileName || "fayl");
    },
    onError: async (error) => {
      toast.error(await readErrorMessage(error, "Faylni yuklab bo'lmadi"));
    },
  });
