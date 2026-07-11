import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// useAppQuery

export const useAppQuery = ({
  queryKey,
  queryFn,
  enabled = true,
  staleTime,
  gcTime,
  retry,
  keepPreviousData,
  select,
  ...rest
}) => {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await queryFn();
      return response.data;
    },
    enabled,
    ...(staleTime !== undefined && { staleTime }),
    ...(gcTime !== undefined && { gcTime }),
    ...(retry !== undefined && { retry }),
    ...(keepPreviousData && { placeholderData: (prev) => prev }),
    ...(select && { select }),
    ...rest,
  });
};

// useAppMutation

export const useAppMutation = ({
  mutationFn,
  invalidateKeys = [],
  onSuccess,
  onError,
  onSettled,
  ...rest
}) => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (variables) => {
      const response = await mutationFn(variables);
      return response.data;
    },
    onSuccess: async (data, variables) => {
      // Invalidate related queries
      if (invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map((key) => qc.invalidateQueries({ queryKey: key })),
        );
      }

      onSuccess?.(data, variables);
    },
    onError,
    onSettled,
    ...rest,
  });
};

// useOptimisticMutation

export const useOptimisticMutation = ({
  mutationFn,
  queryKey,
  updater,
  invalidateKeys = [],
  onSuccess,
  onError,
}) => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (variables) => {
      const response = await mutationFn(variables);
      return response.data;
    },

    onMutate: async (variables) => {
      // Cancel running queries so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey });

      // Snapshot current value
      const previousData = qc.getQueryData(queryKey);

      // Optimistically set new value
      qc.setQueryData(queryKey, (old) => updater(old, variables));

      return { previousData };
    },

    onError: (error, variables, context) => {
      // Rollback to snapshot
      if (context?.previousData !== undefined) {
        qc.setQueryData(queryKey, context.previousData);
      }

      onError?.(error, variables);
    },

    onSuccess,

    onSettled: async () => {
      // Always refetch after mutation settles to ensure cache is correct
      const keysToInvalidate = [queryKey, ...invalidateKeys];
      await Promise.all(
        keysToInvalidate.map((key) => qc.invalidateQueries({ queryKey: key })),
      );
    },
  });
};
