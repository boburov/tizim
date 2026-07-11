import queryClient from "@/app/query-client";

// ─── Invalidation helpers ──────────────────────────────────────────────

export const invalidateQueries = (queryKey) => {
  return queryClient.invalidateQueries({ queryKey });
};

export const invalidateMany = (queryKeys) => {
  return Promise.all(queryKeys.map((key) => invalidateQueries(key)));
};

// ─── Refetch helpers ───────────────────────────────────────────────────

export const refetchQueries = (queryKey) => {
  return queryClient.refetchQueries({ queryKey });
};

// ─── Cache read / write ────────────────────────────────────────────────

export const getQueryData = (queryKey) => {
  return queryClient.getQueryData(queryKey);
};

export const setQueryData = (queryKey, data) => {
  queryClient.setQueryData(queryKey, data);
};

// Optimistic update helper - updater receives old data
export const updateQueryData = (queryKey, updater) => {
  queryClient.setQueryData(queryKey, updater);
};

// ─── Cache removal ─────────────────────────────────────────────────────

export const removeQueries = (queryKey) => {
  queryClient.removeQueries({ queryKey });
};

export const clearAllQueries = () => {
  queryClient.clear();
};

// ─── Prefetching ───────────────────────────────────────────────────────

export const prefetchQuery = (queryKey, queryFn, staleTime = 5 * 60 * 1000) => {
  return queryClient.prefetchQuery({ queryKey, queryFn, staleTime });
};

// ─── TTL helpers ───────────────────────────────────────────────────────

export const setQueryTTL = (queryKey, { staleTime, gcTime } = {}) => {
  queryClient.setQueryDefaults(queryKey, {
    ...(staleTime !== undefined && { staleTime }),
    ...(gcTime !== undefined && { gcTime }),
  });
};

// ─── Query state inspection ───────────────────────────────────────────

export const getQueryState = (queryKey) => {
  return queryClient.getQueryState(queryKey);
};

export const isQueryFetching = (queryKey) => {
  return queryClient.isFetching({ queryKey }) > 0;
};

// ─── Cancel queries ────────────────────────────────────────────────────

// Cancel before an optimistic update so the in-flight result does not overwrite it
export const cancelQueries = (queryKey) => {
  return queryClient.cancelQueries({ queryKey });
};
