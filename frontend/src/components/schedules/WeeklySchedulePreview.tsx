import { Stack, Text } from "@mantine/core";
import {
  WEEKDAY_LABELS_ES,
  WEEKDAYS,
  type WeeklyScheduleDay,
  isOvernightSchedule,
} from "../../types/schedule";

interface WeeklySchedulePreviewProps {
  days: WeeklyScheduleDay[];
}

export function WeeklySchedulePreview({ days }: WeeklySchedulePreviewProps) {
  return (
    <Stack gap={4}>
      {WEEKDAYS.map((dayOfWeek) => {
        const day = days.find((item) => item.dayOfWeek === dayOfWeek);
        const label = !day || !day.isEnabled
          ? "No laborable"
          : `${day.startTime}–${day.endTime}${
              day.startTime && day.endTime && isOvernightSchedule(day.startTime, day.endTime)
                ? " (día siguiente)"
                : ""
            }`;

        return (
          <Text key={dayOfWeek} size="sm">
            <Text component="span" fw={500} style={{ display: "inline-block", minWidth: 96 }}>
              {WEEKDAY_LABELS_ES[dayOfWeek]}
            </Text>{" "}
            {label}
          </Text>
        );
      })}
    </Stack>
  );
}
