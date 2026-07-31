import type { QueryClient } from "@tanstack/react-query";
import { attendanceKeys } from "./attendance";
import { employeeCategoryKeys } from "./employee-categories";
import { employeeKeys } from "./employees";
import { lookupKeys } from "./lookups";
import { operationAttendanceKeys, operationKeys } from "./operations";
import { serviceKeys } from "./services";
import { statisticsKeys } from "./statistics";
import { workTeamKeys } from "./work-teams";

/**
 * Invalidates service lists, facets, lookups and related operation lists.
 * Does not invalidate service details — callers should setQueryData the exact detail when known.
 */
export async function invalidateServiceListAndLookupQueries(
  queryClient: QueryClient,
  companyId: string | undefined,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: serviceKeys.lists(companyId) }),
    queryClient.invalidateQueries({ queryKey: serviceKeys.facets(companyId) }),
    queryClient.invalidateQueries({ queryKey: lookupKeys.serviceCompany(companyId) }),
    queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) }),
  ]);
}

/** @deprecated Prefer invalidateServiceListAndLookupQueries + setQueryData for detail. */
export async function invalidateServiceScopedQueries(
  queryClient: QueryClient,
  companyId: string | undefined,
): Promise<void> {
  await invalidateServiceListAndLookupQueries(queryClient, companyId);
}

export async function invalidateEmployeeListAndLookupQueries(
  queryClient: QueryClient,
  companyId: string | undefined,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: employeeKeys.lists(companyId) }),
    queryClient.invalidateQueries({ queryKey: lookupKeys.employeeCompany(companyId) }),
    queryClient.invalidateQueries({ queryKey: workTeamKeys.lists(companyId) }),
    queryClient.invalidateQueries({ queryKey: workTeamKeys.details(companyId) }),
    queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) }),
  ]);
}

/** @deprecated Prefer invalidateEmployeeListAndLookupQueries + setQueryData for detail. */
export async function invalidateEmployeeScopedQueries(
  queryClient: QueryClient,
  companyId: string | undefined,
): Promise<void> {
  await invalidateEmployeeListAndLookupQueries(queryClient, companyId);
}

/**
 * Pure invalidator for a future employee company-transfer API.
 * Ready for source + target companies; not wired to a mutation (no backend contract).
 */
export async function invalidateEmployeeTransferQueries(
  queryClient: QueryClient,
  sourceCompanyId: string,
  targetCompanyId: string,
  employeeId: string,
): Promise<void> {
  await Promise.all([
    invalidateEmployeeListAndLookupQueries(queryClient, sourceCompanyId),
    invalidateEmployeeListAndLookupQueries(queryClient, targetCompanyId),
    queryClient.removeQueries({
      queryKey: employeeKeys.detail(sourceCompanyId, employeeId),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: employeeKeys.detail(targetCompanyId, employeeId),
    }),
    queryClient.invalidateQueries({ queryKey: statisticsKeys.company(sourceCompanyId) }),
    queryClient.invalidateQueries({ queryKey: statisticsKeys.company(targetCompanyId) }),
  ]);
}

export async function invalidateAttendanceReviewQueries(
  queryClient: QueryClient,
  companyId: string | undefined,
  attendanceId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: attendanceKeys.lists(companyId) }),
    queryClient.invalidateQueries({ queryKey: attendanceKeys.detail(companyId, attendanceId) }),
    queryClient.invalidateQueries({ queryKey: attendanceKeys.reviews(companyId, attendanceId) }),
    queryClient.invalidateQueries({
      queryKey: operationAttendanceKeys.company(companyId),
    }),
    queryClient.invalidateQueries({ queryKey: statisticsKeys.company(companyId) }),
  ]);
}

export type ImportEntityTypeForInvalidation = "operations" | "services" | "employees";

export async function invalidateAfterImport(
  queryClient: QueryClient,
  companyId: string | undefined,
  entityType: ImportEntityTypeForInvalidation,
  affectedCompanyIds?: string[],
): Promise<void> {
  const companies =
    affectedCompanyIds && affectedCompanyIds.length > 0
      ? [...new Set(affectedCompanyIds)]
      : companyId
        ? [companyId]
        : [];

  for (const id of companies) {
    switch (entityType) {
      case "services":
        await invalidateServiceListAndLookupQueries(queryClient, id);
        await queryClient.invalidateQueries({ queryKey: serviceKeys.details(id) });
        break;
      case "employees":
        await invalidateEmployeeListAndLookupQueries(queryClient, id);
        await queryClient.invalidateQueries({ queryKey: employeeKeys.details(id) });
        await queryClient.invalidateQueries({ queryKey: employeeCategoryKeys.lists(id) });
        break;
      case "operations":
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: operationKeys.list(id) }),
          queryClient.invalidateQueries({ queryKey: lookupKeys.operationCompany(id) }),
          queryClient.invalidateQueries({ queryKey: statisticsKeys.company(id) }),
        ]);
        break;
      default: {
        const exhaustive: never = entityType;
        console.warn(
          `Import invalidation skipped for unsupported entityType: ${String(exhaustive)}`,
        );
      }
    }
  }
}
