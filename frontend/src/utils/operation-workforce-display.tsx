import { Stack, Text } from "@mantine/core";
import type { AttendanceRecord } from "../types/attendance";
import { formatTime } from "./dates";
import { checkoutStatusLabels, punctualityStatusLabels } from "./labels";

function stackedTimeCell(primary: string, secondary?: string | null) {
  if (!secondary) {
    return primary;
  }

  return (
    <Stack gap={2}>
      <Text size="sm">{primary}</Text>
      <Text size="xs" c="dimmed">
        {secondary}
      </Text>
    </Stack>
  );
}

export function formatOperationalCheckInCell(attendance: AttendanceRecord | null) {
  if (!attendance) {
    return "—";
  }

  const time = formatTime(attendance.receivedAt);

  if (
    attendance.validationStatus === "PENDING_REVIEW" ||
    attendance.locationStatus === "OUTSIDE_GEOFENCE" ||
    attendance.locationStatus === "INVALID_LOCATION"
  ) {
    return stackedTimeCell(time, "Requiere revisión");
  }

  const punctualityLabel = punctualityStatusLabels[attendance.punctualityStatus];
  if (punctualityLabel === "A tiempo" || punctualityLabel === "Tarde") {
    return stackedTimeCell(time, punctualityLabel);
  }

  return time;
}

export function formatOperationalCheckOutCell(attendance: AttendanceRecord | null) {
  if (!attendance?.checkoutAt) {
    return "—";
  }

  const time = formatTime(attendance.checkoutAt);

  if (attendance.extraWorkedMinutes && attendance.extraWorkedMinutes > 0) {
    return stackedTimeCell(time, `+${attendance.extraWorkedMinutes} min extra`);
  }

  if (attendance.earlyDepartureMinutes && attendance.earlyDepartureMinutes > 0) {
    return stackedTimeCell(time, `${attendance.earlyDepartureMinutes} min antes`);
  }

  if (attendance.checkoutStatus === "CHECKOUT_LATE_EXTRA_TIME") {
    return stackedTimeCell(time, checkoutStatusLabels.CHECKOUT_LATE_EXTRA_TIME);
  }

  if (attendance.checkoutStatus === "CHECKOUT_EARLY_REVIEW") {
    return stackedTimeCell(time, "Salida anticipada");
  }

  return time;
}
