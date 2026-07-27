/**
 * Attendance query keys (company-scoped).
 */

export const attendanceKeys = {
  all: ["attendance"] as const,
  lists: (companyId: string | undefined) => [...attendanceKeys.all, companyId] as const,
  list: (companyId: string | undefined, filters?: unknown) =>
    filters === undefined
      ? attendanceKeys.lists(companyId)
      : ([...attendanceKeys.lists(companyId), filters] as const),
  details: (companyId: string | undefined) => ["attendance-record", companyId] as const,
  detail: (companyId: string | undefined, attendanceId: string | undefined) =>
    [...attendanceKeys.details(companyId), attendanceId] as const,
  reviewsRoot: (companyId: string | undefined) => ["attendance-reviews", companyId] as const,
  reviews: (
    companyId: string | undefined,
    attendanceId: string | undefined,
    page?: number,
    limit?: number,
  ) =>
    page === undefined || limit === undefined
      ? ([...attendanceKeys.reviewsRoot(companyId), attendanceId] as const)
      : ([...attendanceKeys.reviewsRoot(companyId), attendanceId, page, limit] as const),
};
