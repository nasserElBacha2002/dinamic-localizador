/**
 * Employee category query keys (company-scoped).
 */

export const employeeCategoryKeys = {
  all: ["employee-categories"] as const,
  lists: (companyId: string | undefined) => [...employeeCategoryKeys.all, companyId] as const,
  list: (companyId: string | undefined, filters?: unknown) =>
    filters === undefined
      ? employeeCategoryKeys.lists(companyId)
      : ([...employeeCategoryKeys.lists(companyId), filters] as const),
};
