import { Checkbox, Grid, Group, Stack, Text } from "@mantine/core";
import { OperationTimeInput } from "../../pages/settings/components/OperationTimeInput";
import {
  WEEKDAY_LABELS_ES,
  WEEKDAYS,
  type WeeklyScheduleDay,
  isOvernightSchedule,
} from "../../types/schedule";

export interface WeeklyScheduleEditorProps {
  value: WeeklyScheduleDay[];
  onChange: (value: WeeklyScheduleDay[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

export function WeeklyScheduleEditor({
  value,
  onChange,
  disabled = false,
  readOnly = false,
}: WeeklyScheduleEditorProps) {
  const updateDay = (dayOfWeek: WeeklyScheduleDay["dayOfWeek"], patch: Partial<WeeklyScheduleDay>) => {
    onChange(
      value.map((day) =>
        day.dayOfWeek === dayOfWeek
          ? {
              ...day,
              ...patch,
            }
          : day,
      ),
    );
  };

  return (
    <Stack gap="sm">
      {WEEKDAYS.map((dayOfWeek) => {
        const day = value.find((item) => item.dayOfWeek === dayOfWeek) ?? {
          dayOfWeek,
          isEnabled: false,
          startTime: null,
          endTime: null,
        };
        const overnight =
          day.isEnabled && day.startTime && day.endTime
            ? isOvernightSchedule(day.startTime, day.endTime)
            : false;

        return (
          <Grid key={dayOfWeek} align="center" gap="sm">
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Group gap="xs" wrap="nowrap">
                <Checkbox
                  checked={day.isEnabled}
                  disabled={disabled || readOnly}
                  onChange={(event) => {
                    const enabled = event.currentTarget.checked;
                    updateDay(dayOfWeek, {
                      isEnabled: enabled,
                      startTime: enabled ? day.startTime ?? "09:00" : null,
                      endTime: enabled ? day.endTime ?? "18:00" : null,
                    });
                  }}
                  aria-label={WEEKDAY_LABELS_ES[dayOfWeek]}
                />
                <Text size="sm" fw={500} style={{ minWidth: 88 }}>
                  {WEEKDAY_LABELS_ES[dayOfWeek]}
                </Text>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <OperationTimeInput
                aria-label={`${WEEKDAY_LABELS_ES[dayOfWeek]} desde`}
                value={day.startTime ?? ""}
                disabled={!day.isEnabled || disabled || readOnly}
                onChange={(next) => updateDay(dayOfWeek, { startTime: next || null })}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <OperationTimeInput
                aria-label={`${WEEKDAY_LABELS_ES[dayOfWeek]} hasta`}
                value={day.endTime ?? ""}
                disabled={!day.isEnabled || disabled || readOnly}
                onChange={(next) => updateDay(dayOfWeek, { endTime: next || null })}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 1 }}>
              {overnight ? (
                <Text size="xs" c="dimmed">
                  Finaliza al día siguiente
                </Text>
              ) : null}
            </Grid.Col>
          </Grid>
        );
      })}
    </Stack>
  );
}
