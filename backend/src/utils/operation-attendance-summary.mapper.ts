import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { OperationalStatus } from "../types/auth";
import type { AttendanceRecord } from "../types/domain";
import { mapAttendanceRow, mapEmployeeRow } from "./row-mappers";

export const parseConfirmationStatus = (value: unknown): AssignmentConfirmationStatus => {
  const status = String(value ?? "PENDING");
  if (status === "CONFIRMED" || status === "UNAVAILABLE") {
    return status;
  }
  return "PENDING";
};

export const toIsoOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const resolveOperationalStatus = (attendance: AttendanceRecord | null): OperationalStatus => {
  if (!attendance) {
    return "NO_CHECK_IN";
  }

  if (attendance.validationStatus === "VALID") {
    return "VALID";
  }

  if (attendance.validationStatus === "PENDING_REVIEW") {
    return "PENDING_REVIEW";
  }

  return "REJECTED";
};

export const mapOperationAttendanceSummaryRow = (
  row: Record<string, unknown>,
): {
  employee: ReturnType<typeof mapEmployeeRow>;
  attendance: AttendanceRecord | null;
  operationalStatus: OperationalStatus;
  confirmationStatus: AssignmentConfirmationStatus;
  confirmedAt: string | null;
  unavailableAt: string | null;
} => {
  const employee = mapEmployeeRow(row);
  const attendance = row.attendance_id
    ? mapAttendanceRow({
        id: row.attendance_id,
        operation_id: row.attendance_operation_id,
        employee_id: row.attendance_employee_id,
        received_latitude: row.received_latitude,
        received_longitude: row.received_longitude,
        distance_meters: row.distance_meters,
        validation_status: row.validation_status,
        location_status: row.location_status,
        punctuality_status: row.punctuality_status,
        source_message_sid: row.source_message_sid,
        validation_reason: row.validation_reason,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        review_reason: row.review_reason,
        received_at: row.received_at,
        checkout_at: row.checkout_at,
        checkout_latitude: row.checkout_latitude,
        checkout_longitude: row.checkout_longitude,
        checkout_distance_meters: row.checkout_distance_meters,
        checkout_status: row.checkout_status,
        checkout_review_reason: row.checkout_review_reason,
        early_departure_minutes: row.early_departure_minutes,
        extra_worked_minutes: row.extra_worked_minutes,
        checkout_message_sid: row.checkout_message_sid,
        created_at: row.attendance_created_at,
      } as Record<string, unknown>)
    : null;

  return {
    employee,
    attendance,
    operationalStatus: resolveOperationalStatus(attendance),
    confirmationStatus: parseConfirmationStatus(row.confirmation_status),
    confirmedAt: toIsoOrNull(row.confirmed_at),
    unavailableAt: toIsoOrNull(row.unavailable_at),
  };
};
