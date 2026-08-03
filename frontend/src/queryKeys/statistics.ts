/**
 * Statistics dashboard query keys (company-scoped).
 */

export const statisticsKeys = {
  all: ["statistics"] as const,
  company: (companyId: string | undefined) => [...statisticsKeys.all, companyId] as const,
  summary: (companyId: string | undefined, filters: unknown) =>
    [...statisticsKeys.company(companyId), "summary", filters] as const,
  timeline: (companyId: string | undefined, filters: unknown) =>
    [...statisticsKeys.company(companyId), "timeline", filters] as const,
  statusDistribution: (companyId: string | undefined, filters: unknown) =>
    [...statisticsKeys.company(companyId), "status-distribution", filters] as const,
  actionExceptions: (companyId: string | undefined, filters: unknown) =>
    [...statisticsKeys.company(companyId), "action-exceptions", filters] as const,
  byEmployee: (companyId: string | undefined, filters: unknown) =>
    [...statisticsKeys.company(companyId), "by-employee", filters] as const,
  byOperation: (companyId: string | undefined, filters: unknown) =>
    [...statisticsKeys.company(companyId), "by-operation", filters] as const,
  byLocation: (companyId: string | undefined, filters: unknown) =>
    [...statisticsKeys.company(companyId), "by-service", filters] as const,
  workdayDetails: (companyId: string | undefined, filters: unknown) =>
    [...statisticsKeys.company(companyId), "workday-details", filters] as const,
};
