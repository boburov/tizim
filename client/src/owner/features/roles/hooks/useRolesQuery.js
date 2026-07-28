import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { rolesAPI } from "../api/roles.api";

export const useRolesQuery = () =>
  useQuery({
    queryKey: qk.roles.list(),
    queryFn: () => rolesAPI.list().then((r) => r.data.data),
  });

// Ruxsatlar matritsasi tizim bilan birga o'zgaradi (deploy'da), shuning
// uchun uzoq staleTime - har rol tanlanganda qayta yuklanmasin.
export const useRolesMatrixQuery = () =>
  useQuery({
    queryKey: qk.roles.matrix(),
    queryFn: () => rolesAPI.matrix().then((r) => r.data.data),
    staleTime: 30 * 60 * 1000,
  });

export const useRoleQuery = (value) =>
  useQuery({
    queryKey: qk.roles.one(value),
    queryFn: () => rolesAPI.byValue(value).then((r) => r.data.data),
    enabled: Boolean(value),
  });

export default useRolesQuery;
