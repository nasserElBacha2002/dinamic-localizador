import type { AbsenceRequestFilters } from "../types/absence";

export const absenceKeys = {
  all: ["absences"] as const,
  company: (companyId: string | null | undefined) =>
    [...absenceKeys.all, "company", companyId ?? "none"] as const,
  types: (companyId: string | null | undefined) =>
    [...absenceKeys.company(companyId), "types"] as const,
  lists: (companyId: string | null | undefined) =>
    [...absenceKeys.company(companyId), "list"] as const,
  list: (companyId: string | null | undefined, filters: AbsenceRequestFilters) =>
    [...absenceKeys.lists(companyId), filters] as const,
  details: (companyId: string | null | undefined) =>
    [...absenceKeys.company(companyId), "detail"] as const,
  detail: (companyId: string | null | undefined, requestId: string) =>
    [...absenceKeys.details(companyId), requestId] as const,
  balances: (
    companyId: string | null | undefined,
    employeeId: string,
    year: number,
  ) => [...absenceKeys.company(companyId), "balances", employeeId, year] as const,
  calendars: (companyId: string | null | undefined) =>
    [...absenceKeys.company(companyId), "calendars"] as const,
  calendarDefault: (companyId: string | null | undefined) =>
    [...absenceKeys.calendars(companyId), "default"] as const,
  calendarDates: (
    companyId: string | null | undefined,
    calendarId: string,
    year?: number,
  ) => [...absenceKeys.calendars(companyId), calendarId, "dates", year ?? "all"] as const,
  calculate: (
    companyId: string | null | undefined,
    payload: Record<string, unknown>,
  ) => [...absenceKeys.company(companyId), "calculate", payload] as const,
};

/** Normalize legacy `employeeId` query param into canonical `employeeIds`. */
export function normalizeAbsencesListSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const legacy = params.get("employeeId")?.trim();
  if (!legacy) {
    return null;
  }
  if (!params.get("employeeIds")) {
    params.set("employeeIds", legacy);
  }
  params.delete("employeeId");
  const next = params.toString();
  return next === (search.startsWith("?") ? search.slice(1) : search) ? null : next;
}
