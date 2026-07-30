import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  calculateAbsenceDuration,
  createAbsenceCalendarDate,
  getDefaultAbsenceCalendar,
  listAbsenceCalendarDates,
  updateAbsenceCalendar,
  updateAbsenceCalendarDate,
} from "../api/absence-calendar.api";
import { absenceKeys } from "../api/absence-query-keys";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";
import type { AbsenceDayPeriod } from "../types/absence";

export function useDefaultAbsenceCalendar(extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);
  return useQuery({
    queryKey: absenceKeys.calendarDefault(companyId),
    queryFn: getDefaultAbsenceCalendar,
    enabled,
  });
}

export function useAbsenceCalendarDates(
  calendarId: string | undefined,
  year?: number,
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);
  return useQuery({
    queryKey: absenceKeys.calendarDates(companyId, calendarId ?? "none", year),
    queryFn: () => listAbsenceCalendarDates(calendarId!, { year }),
    enabled: enabled && Boolean(calendarId),
  });
}

export function useAbsenceDurationPreview(
  input: {
    employeeId: string;
    absenceTypeId: string;
    startDate: string;
    endDate: string;
    startPeriod: AbsenceDayPeriod;
    endPeriod: AbsenceDayPeriod;
  } | null,
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);
  return useQuery({
    queryKey: absenceKeys.calculate(companyId, input ?? {}),
    queryFn: () => calculateAbsenceDuration(input!),
    enabled:
      enabled &&
      Boolean(
        input?.employeeId &&
          input.absenceTypeId &&
          input.startDate &&
          input.endDate &&
          input.startDate <= input.endDate,
      ),
  });
}

export function useUpdateAbsenceCalendar() {
  const { companyId } = useOperationalQueryEnabled();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      calendarId,
      ...input
    }: {
      calendarId: string;
      name?: string;
      timezone?: string;
      isDefault?: boolean;
      isActive?: boolean;
      weekdays?: Array<{ dayOfWeek: number; isWorkingDay: boolean }>;
      expectedUpdatedAt: string;
    }) => updateAbsenceCalendar(calendarId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: absenceKeys.calendars(companyId) });
    },
  });
}

export function useCreateAbsenceCalendarDate() {
  const { companyId } = useOperationalQueryEnabled();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAbsenceCalendarDate,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: absenceKeys.calendars(companyId),
      });
      void queryClient.invalidateQueries({
        queryKey: absenceKeys.calendarDates(companyId, variables.calendarId),
      });
    },
  });
}

export function useUpdateAbsenceCalendarDate() {
  const { companyId } = useOperationalQueryEnabled();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      dateId,
      ...input
    }: {
      dateId: string;
      name?: string;
      dateType?: string;
      isWorkingDay?: boolean;
      notes?: string | null;
      isActive?: boolean;
      expectedUpdatedAt: string;
      calendarId: string;
    }) => updateAbsenceCalendarDate(dateId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: absenceKeys.calendarDates(companyId, variables.calendarId),
      });
    },
  });
}
