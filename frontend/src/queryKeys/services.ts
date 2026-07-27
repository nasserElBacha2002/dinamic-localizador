/**
 * Service CRUD query keys (company-scoped).
 * Invalidation uses the shortest prefix so every filtered variant refreshes.
 */

export const serviceKeys = {
  all: ["services"] as const,
  lists: (companyId: string | undefined) => [...serviceKeys.all, companyId] as const,
  list: (companyId: string | undefined, filters?: unknown) =>
    filters === undefined
      ? serviceKeys.lists(companyId)
      : ([...serviceKeys.lists(companyId), filters] as const),
  details: (companyId: string | undefined) => ["service", companyId] as const,
  detail: (companyId: string | undefined, serviceId: string | undefined) =>
    [...serviceKeys.details(companyId), serviceId] as const,
  facets: (companyId: string | undefined) => ["service-facets", companyId] as const,
};
