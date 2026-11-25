import { env } from "../../config/env";

/**
 * Deep link to operation team management (session auth; company from session).
 * Optional workDate helps focus the team panel on the affected occurrence.
 */
export const buildOperationAdminUrl = (
  operationId: string,
  options?: { workDate?: string | null; employeeWorkdayId?: string | null },
): string => {
  const base = `${env.FRONTEND_URL.replace(/\/$/, "")}/operations/${operationId.trim()}`;
  const params = new URLSearchParams();
  if (options?.workDate?.trim()) {
    params.set("workDate", options.workDate.trim());
  }
  if (options?.employeeWorkdayId?.trim()) {
    params.set("employeeWorkdayId", options.employeeWorkdayId.trim());
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
};