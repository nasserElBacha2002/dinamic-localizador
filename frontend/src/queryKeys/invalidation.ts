import type { QueryClient } from "@tanstack/react-query";
import { attendanceKeys } from "./attendance";
import { employeeKeys } from "./employees";
import { lookupKeys } from "./lookups";
import { operationKeys } from "./operations";
import { serviceKeys } from "./services";
import { statisticsKeys } from "./statistics";

export async function invalidateServiceScopedQueries(
  queryClient: QueryClient,
  companyId: string | undefined,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: serviceKeys.lists(companyId) }),
    queryClient.invalidateQueries({ queryKey: serviceKeys.details(companyId) }),
    queryClient.invalidateQueries({ queryKey: serviceKeys.facets(companyId) }),
    queryClient.invalidateQueries({ queryKey: lookupKeys.serviceCompany(companyId) }),
    // Operations embed service name/address — refresh lists so selectors/labels stay current.
    queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) }),
  ]);
}

export async function invalidateEmployeeScopedQueries(
  queryClient: QueryClient,
  companyId: string | undefined,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: employeeKeys.lists(companyId) }),
    queryClient.invalidateQueries({ queryKey: employeeKeys.details(companyId) }),
    queryClient.invalidateQueries({ queryKey: lookupKeys.employeeCompany(companyId) }),
    queryClient.invalidateQueries({ queryKey: ["work-teams", companyId] }),
    queryClient.invalidateQueries({ queryKey: ["work-team", companyId] }),
    queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) }),
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
    queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] }),
    queryClient.invalidateQueries({ queryKey: statisticsKeys.company(companyId) }),
  ]);
}

export type ImportEntityTypeForInvalidation = "operations" | "services" | "employees";

export async function invalidateAfterImport(
  queryClient: QueryClient,
  companyId: string | undefined,
  entityType: ImportEntityTypeForInvalidation,
): Promise<void> {
  switch (entityType) {
    case "services":
      await invalidateServiceScopedQueries(queryClient, companyId);
      return;
    case "employees":
      await invalidateEmployeeScopedQueries(queryClient, companyId);
      await queryClient.invalidateQueries({ queryKey: ["employee-categories", companyId] });
      return;
    case "operations":
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) }),
        queryClient.invalidateQueries({ queryKey: lookupKeys.operationCompany(companyId) }),
        queryClient.invalidateQueries({ queryKey: statisticsKeys.company(companyId) }),
      ]);
      return;
    default: {
      const exhaustive: never = entityType;
      console.warn(`Import invalidation skipped for unsupported entityType: ${String(exhaustive)}`);
    }
  }
}
