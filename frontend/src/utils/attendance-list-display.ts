import type { AttendanceEffectiveState, AttendanceRecordWithRelations } from "../types/attendance";
import { employeeWorkdayEffectiveStateLabels } from "./statistics-display-labels";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "./labels";
import {
  attendanceEffectiveStateTone,
  locationStatusTone,
  punctualityStatusTone,
  validationStatusTone,
} from "./attendance-status-tones";

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
