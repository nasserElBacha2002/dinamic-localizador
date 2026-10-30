import { Select, Stack } from "@mantine/core";
import { useMemo } from "react";
import { WeeklyScheduleEditor } from "../../../../components/schedules/WeeklyScheduleEditor";
import {
  getCanonicalOperationTimezone,
  getOperationTimezoneOptions,
} from "../../../../constants/operation-timezones";
import type { WeeklyScheduleDay } from "../../../../types/schedule";

interface CompanyWeeklyScheduleDialogContentProps {
  timezone: string;
  days: WeeklyScheduleDay[];
  onTimezoneChange: (timezone: string) => void;
  onDaysChange: (days: WeeklyScheduleDay[]) => void;
  disabled?: boolean;
  showTimezone?: boolean;
}

export function CompanyWeeklyScheduleDialogContent({
  timezone,
  days,
  onTimezoneChange,
  onDaysChange,
  disabled = false,
  showTimezone = true,
}: CompanyWeeklyScheduleDialogContentProps) {
  const timezoneOptions = useMemo(
    () => getOperationTimezoneOptions(timezone),
    [timezone],
  );

  return (
    <Stack gap="md">
      {showTimezone ? (
        <Select
          searchable
          label="Zona horaria"
          data={timezoneOptions}
          value={getCanonicalOperationTimezone(timezone)}
          onChange={(value) => {
            if (value) {
              onTimezoneChange(value);
            }
          }}
          disabled={disabled}
        />
      ) : null}

      <WeeklyScheduleEditor value={days} onChange={onDaysChange} disabled={disabled} />
    </Stack>
  );
}
