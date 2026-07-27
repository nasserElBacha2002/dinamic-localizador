/**
 * Work-team query keys (company-scoped).
 */

export const workTeamKeys = {
  all: ["work-teams"] as const,
  lists: (companyId: string | undefined) => [...workTeamKeys.all, companyId] as const,
  list: (companyId: string | undefined, filters?: unknown) =>
    filters === undefined
      ? workTeamKeys.lists(companyId)
      : ([...workTeamKeys.lists(companyId), filters] as const),
  details: (companyId: string | undefined) => ["work-team", companyId] as const,
  detail: (companyId: string | undefined, workTeamId: string | undefined) =>
    [...workTeamKeys.details(companyId), workTeamId] as const,
  usage: (
    companyId: string | undefined,
    workTeamId: string | undefined,
    filters?: unknown,
  ) =>
    filters === undefined
      ? ([...workTeamKeys.details(companyId), workTeamId, "usage"] as const)
      : ([...workTeamKeys.details(companyId), workTeamId, "usage", filters] as const),
};
