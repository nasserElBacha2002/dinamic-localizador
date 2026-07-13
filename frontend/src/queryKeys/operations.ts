/**
 * Centralized React Query key factories for operation-scoped data.
 *
 * All operational keys include the companyId so cache entries are never reused
 * across companies, and the operation-scoped keys include the operationId so a
 * mutation on one operation never invalidates unrelated operations.
 *
 * Invalidation uses the shortest scoped prefix (without filters) so that every
 * cached variant of a query for the same company/operation is refreshed while
 * other companies and operations stay untouched.
 */

export const operationKeys = {
  list: (companyId: string | undefined, filters?: unknown) =>
    filters === undefined
      ? (["operations", companyId] as const)
      : (["operations", companyId, filters] as const),
  detail: (companyId: string | undefined, operationId: string | undefined) =>
    ["operation", companyId, operationId] as const,
};

export const operationEmployeeKeys = {
  list: (companyId: string | undefined, operationId: string | undefined) =>
    ["operation-employees", companyId, operationId] as const,
};

export const operationAttendanceKeys = {
  summary: (
    companyId: string | undefined,
    operationId: string | undefined,
    filters?: unknown,
  ) =>
    filters === undefined
      ? (["operation-attendance-summary", companyId, operationId] as const)
      : (["operation-attendance-summary", companyId, operationId, filters] as const),
};

export const operationWorkdayKeys = {
  list: (
    companyId: string | undefined,
    operationId: string | undefined,
    filters?: unknown,
  ) =>
    filters === undefined
      ? (["operation-workdays", companyId, operationId] as const)
      : (["operation-workdays", companyId, operationId, filters] as const),
  detail: (
    companyId: string | undefined,
    operationId: string | undefined,
    workdayId: string | undefined,
  ) => ["operation-workday-detail", companyId, operationId, workdayId] as const,
};
