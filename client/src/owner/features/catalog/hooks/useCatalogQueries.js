import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { coursesAPI, roomsAPI } from "../api/catalog.api";
import { apiErrorToast } from "@/shared/utils/apiError";

export const useCoursesQuery = (params = {}) =>
  useQuery({
    queryKey: qk.courses.list(params),
    queryFn: () => coursesAPI.list(params).then((r) => r.data),
  });

export const useCoursePricesQuery = (id, options = {}) =>
  useQuery({
    queryKey: qk.courses.prices(id),
    queryFn: () => coursesAPI.prices(id).then((r) => r.data.data),
    enabled: Boolean(id),
    ...options,
  });

// `options` — `enabled` uchun. Filial kartasidagi "Xonalar" tabi
// ochilmaguncha so'rov ketmasligi kerak (talab 29).
export const useRoomsQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.rooms.list(params),
    queryFn: () => roomsAPI.list(params).then((r) => r.data),
    ...options,
  });

// Nomi `use` bilan boshlanadi - eslint hook qoidasi shuni talab qiladi
// va u haqli: ichida useQueryClient/useMutation chaqiriladi, ya'ni bu
// oddiy funksiya emas, HOOK.
const useCatalogMutation = (fn, msg, keys, options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars, ctx) => {
      keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success(typeof msg === "function" ? msg(data) : msg);
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useCourseCreateMutation = (o) =>
  useCatalogMutation((body) => coursesAPI.create(body).then((r) => r.data.data), "Kurs qo'shildi", [qk.courses.all()], o);

export const useCourseUpdateMutation = (o) =>
  useCatalogMutation(({ id, body }) => coursesAPI.update(id, body).then((r) => r.data.data), "Saqlandi", [qk.courses.all()], o);

export const useCourseRemoveMutation = (o) =>
  useCatalogMutation((id) => coursesAPI.remove(id).then((r) => r.data), (res) => res?.message || "Nofaol qilindi", [qk.courses.all()], o);

export const useSetPriceMutation = (o) =>
  useCatalogMutation(
    ({ id, body }) => coursesAPI.setPrice(id, body).then((r) => r.data),
    (res) => res?.message || "Narx saqlandi",
    [qk.courses.all()],
    o,
  );

export const useClearPriceMutation = (o) =>
  useCatalogMutation(
    ({ id, branchId }) => coursesAPI.clearPrice(id, branchId).then((r) => r.data),
    "Istisno olib tashlandi",
    [qk.courses.all()],
    o,
  );

export const useRoomCreateMutation = (o) =>
  useCatalogMutation((body) => roomsAPI.create(body).then((r) => r.data.data), "Xona qo'shildi", [qk.rooms.all()], o);

export const useRoomUpdateMutation = (o) =>
  useCatalogMutation(({ id, body }) => roomsAPI.update(id, body).then((r) => r.data.data), "Saqlandi", [qk.rooms.all()], o);

export const useRoomRemoveMutation = (o) =>
  useCatalogMutation((id) => roomsAPI.remove(id).then((r) => r.data), "Xona o'chirildi", [qk.rooms.all()], o);
