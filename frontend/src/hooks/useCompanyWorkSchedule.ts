import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCompanyWorkSchedule,
  updateCompanyWorkSchedule,
} from "../api/company-work-schedule.api";
import type { WeeklyScheduleDay } from "../types/schedule";
import { isRecurringWorkdaySyncError } from "../utils/errors";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useCompanyWorkSchedule(extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["company-work-schedule", companyId],
    queryFn: getCompanyWorkSchedule,
    enabled,
  });
}

export function useUpdateCompanyWorkSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { timezone: string; days: WeeklyScheduleDay[] }) =>
      updateCompanyWorkSchedule(input),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["company-work-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
      queryClient.invalidateQueries({ queryKey: ["operation"] });
    },
  });
}
