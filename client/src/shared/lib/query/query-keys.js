// Hierarchical key factory: all/lists/list/details/detail - matches the invalidation granularity TanStack expects
export const createQueryKeys = (feature) => ({
  all: [feature],
  lists: () => [feature, "list"],
  list: (params) => (params ? [feature, "list", params] : [feature, "list"]),
  details: () => [feature, "detail"],
  detail: (id) => [feature, "detail", id],
});

// ─── Example ───────────────────────────────────────────────────────────

export const usersKeys = createQueryKeys("users");
