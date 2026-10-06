import type { AttendanceEffectiveState, AttendanceRecordWithRelations, LocationStatus } from "../types/attendance";
import { employeeWorkdayEffectiveStateLabels } from "./statistics-display-labels";
import {
  checkoutStatusLabels,
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "./labels";
import {
  attendanceEffectiveStateTone,
  checkoutStatusTone,
  locationStatusTone,
  punctualityStatusTone,
  validationStatusTone,
} from "./attendance-status-tones";
import type { StatusBadgeTone } from "../design-system/components/StatusBadge";

export function attendanceListRowKey(row: AttendanceRecordWithRelations): string {
  if (row.listRowKey) {
    return row.listRowKey;
  }
  if (row.isSimulation) {
    return `sim:${row.id}`;
  }
  if (row.employeeWorkdayId) {
    return `ew:${row.employeeWorkdayId}`;
  }
  return `att:${row.id}`;
}

export function attendanceListDetailPath(row: AttendanceRecordWithRelations): string {
  if (row.hasAttendanceRecord === false && row.employeeWorkdayId) {
    return `/attendance/workdays/${row.employeeWorkdayId}`;
  }
  if (row.hasAttendanceRecord !== false && row.id) {
    return `/attendance/${row.id}`;
  }
  if (row.employeeWorkdayId) {
    return `/attendance/workdays/${row.employeeWorkdayId}`;
  }
  return `/attendance/${row.id}`;
}

export function attendanceListValidationLabel(row: AttendanceRecordWithRelations): string {
  if (row.hasAttendanceRecord === false && row.effectiveState) {
    return employeeWorkdayEffectiveStateLabels[row.effectiveState] ?? row.effectiveState;
  }
  if (!row.validationStatus) {
    return employeeWorkdayEffectiveStateLabels[row.effectiveState ?? "EXPECTED"] ?? "Sin registro";
  }
  return validationStatusLabels[row.validationStatus];
}

export function attendanceListPunctualityLabel(row: AttendanceRecordWithRelations): string {
  if (row.hasAttendanceRecord === false && row.effectiveState) {
    return employeeWorkdayEffectiveStateLabels[row.effectiveState] ?? row.effectiveState;
  }
  return punctualityStatusLabels[row.punctualityStatus];
}

export function attendanceListLocationLabel(row: AttendanceRecordWithRelations): string {
  if (row.hasAttendanceRecord === false) {
    return locationStatusLabels.NOT_RECORDED;
  }
  return locationStatusLabels[row.locationStatus];
}

export function attendanceListValidationTone(row: AttendanceRecordWithRelations) {
  if (row.hasAttendanceRecord === false && row.effectiveState) {
    return attendanceEffectiveStateTone(row.effectiveState);
  }
  if (!row.validationStatus) {
    return "neutral" as const;
  }
  return validationStatusTone(row.validationStatus);
}

export function attendanceListPunctualityTone(row: AttendanceRecordWithRelations) {
  if (row.hasAttendanceRecord === false && row.effectiveState) {
    return attendanceEffectiveStateTone(row.effectiveState as AttendanceEffectiveState);
  }
  return punctualityStatusTone(row.punctualityStatus);
}

export function attendanceListLocationTone(row: AttendanceRecordWithRelations) {
  if (row.hasAttendanceRecord === false) {
    return locationStatusTone("NOT_RECORDED");
  }
  return locationStatusTone(row.locationStatus);
}

export type AttendanceListEventKey = "arrival" | "checkout";

export interface AttendanceListEventStatus {
  event: AttendanceListEventKey;
  label: string;
  tone: StatusBadgeTone;
}

const hasArrivalEvent = (row: AttendanceRecordWithRelations): boolean => row.receivedAt != null;

const hasCheckoutEvent = (row: AttendanceRecordWithRelations): boolean => row.checkoutAt != null;

/**
 * Checkout geofence is persisted only via checkout_status (combineCheckoutValidation) and coordinates.
 * There is no separate checkout location_status column.
 */
export function attendanceListCheckoutLocationStatus(
  row: AttendanceRecordWithRelations,
): LocationStatus {
  if (!hasCheckoutEvent(row)) {
    return "NOT_RECORDED";
  }
  const hasCheckoutCoordinates =
    row.checkoutLatitude != null ||
    row.checkoutLongitude != null ||
    row.checkoutDistanceMeters != null;
  if (!hasCheckoutCoordinates) {
    return "NOT_RECORDED";
  }
  if (
    row.checkoutStatus === "CHECKOUT_LOCATION_REVIEW" ||
    row.checkoutStatus === "CHECKOUT_REJECTED"
  ) {
    return "OUTSIDE_GEOFENCE";
  }
  return "INSIDE_GEOFENCE";
}

export function attendanceListLocationEvents(
  row: AttendanceRecordWithRelations,
): AttendanceListEventStatus[] {
  if (row.hasAttendanceRecord === false) {
    return [
      {
        event: "arrival",
        label: locationStatusLabels.NOT_RECORDED,
        tone: locationStatusTone("NOT_RECORDED"),
      },
    ];
  }

  const arrival: AttendanceListEventStatus = {
    event: "arrival",
    label: locationStatusLabels[row.locationStatus],
    tone: locationStatusTone(row.locationStatus),
  };
  const checkoutLocation = attendanceListCheckoutLocationStatus(row);
  const checkout: AttendanceListEventStatus = {
    event: "checkout",
    label: locationStatusLabels[checkoutLocation],
    tone: locationStatusTone(checkoutLocation),
  };

  if (hasArrivalEvent(row) && hasCheckoutEvent(row)) {
    return [arrival, checkout];
  }
  if (hasCheckoutEvent(row) && !hasArrivalEvent(row)) {
    return [checkout];
  }
  return [arrival];
}

export function attendanceListPunctualityEvents(
  row: AttendanceRecordWithRelations,
): AttendanceListEventStatus[] {
  if (row.hasAttendanceRecord === false && row.effectiveState) {
    return [
      {
        event: "arrival",
        label: employeeWorkdayEffectiveStateLabels[row.effectiveState] ?? row.effectiveState,
        tone: attendanceEffectiveStateTone(row.effectiveState as AttendanceEffectiveState),
      },
    ];
  }

  const arrival: AttendanceListEventStatus = {
    event: "arrival",
    label: punctualityStatusLabels[row.punctualityStatus],
    tone: punctualityStatusTone(row.punctualityStatus),
  };
  const checkout: AttendanceListEventStatus | null =
    hasCheckoutEvent(row) && row.checkoutStatus
      ? {
          event: "checkout",
          label: checkoutStatusLabels[row.checkoutStatus],
          tone: checkoutStatusTone(row.checkoutStatus),
        }
      : null;

  if (hasArrivalEvent(row) && checkout) {
    return [arrival, checkout];
  }
  if (checkout && !hasArrivalEvent(row)) {
    return [checkout];
  }
  return [arrival];
}

export function attendanceListEventStatusesLabel(events: AttendanceListEventStatus[]): string {
  if (events.length === 1) {
    return events[0]?.label ?? "";
  }
  return events
    .map((event) => `${event.event === "arrival" ? "Entrada" : "Salida"}: ${event.label}`)
    .join(" · ");
}
