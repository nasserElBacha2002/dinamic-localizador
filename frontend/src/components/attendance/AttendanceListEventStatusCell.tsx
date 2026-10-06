import { Group, Stack, Text } from "@mantine/core";
import type { AttendanceListEventStatus } from "../../utils/attendance-list-display";
import { AttendanceStatusBadge } from "./AttendanceStatusBadge";

const EVENT_LABELS: Record<AttendanceListEventStatus["event"], string> = {
  arrival: "Entrada",
  checkout: "Salida",
};

interface AttendanceListEventStatusCellProps {
  events: AttendanceListEventStatus[];
}

export function AttendanceListEventStatusCell({ events }: AttendanceListEventStatusCellProps) {
  if (events.length <= 1) {
    const only = events[0];
    if (!only) {
      return null;
    }
    return <AttendanceStatusBadge label={only.label} tone={only.tone} />;
  }

  return (
    <Stack gap={4} component="span">
      {events.map((event) => (
        <Group key={event.event} gap={6} wrap="nowrap" component="span">
          <Text size="xs" c="dimmed" span>
            {EVENT_LABELS[event.event]}
          </Text>
          <AttendanceStatusBadge label={event.label} tone={event.tone} />
        </Group>
      ))}
    </Stack>
  );
}
