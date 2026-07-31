/**
 * Employee CRUD query keys (company-scoped).
 */

export const employeeKeys = {
  all: ["employees"] as const,
  lists: (companyId: string | undefined) => [...employeeKeys.all, companyId] as const,
  list: (companyId: string | undefined, filters?: unknown) =>
    filters === undefined
      ? employeeKeys.lists(companyId)
      : ([...employeeKeys.lists(companyId), filters] as const),
  details: (companyId: string | undefined) => ["employee", companyId] as const,
  detail: (companyId: string | undefined, employeeId: string | undefined) =>
    [...employeeKeys.details(companyId), employeeId] as const,
};
