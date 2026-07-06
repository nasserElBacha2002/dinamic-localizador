import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "../types/domain";
import type { EmployeeAssignedOperation } from "../types/employee-assignment-query";

const parseConfirmationStatus = (value: unknown): AssignmentConfirmationStatus => {
  const status = String(value ?? "PENDING");
  if (status === "CONFIRMED" || status === "UNAVAILABLE") {
    return status;
  }
  return "PENDING";
};

export const mapEmployeeAssignedOperationRow = (
  row: Record<string, unknown>,
): EmployeeAssignedOperation => ({
  operationId: String(row.operation_id),
  serviceName: String(row.service_name),
  serviceAddress: row.service_address ? String(row.service_address) : null,
  serviceLocality: row.service_locality ? String(row.service_locality) : null,
  serviceLatitude: row.service_latitude === null || row.service_latitude === undefined ? null : Number(row.service_latitude),
  serviceLongitude:
    row.service_longitude === null || row.service_longitude === undefined ? null : Number(row.service_longitude),
  scheduledStart: new Date(row.scheduled_start as Date | string).toISOString(),
  scheduledEnd: new Date(row.scheduled_end as Date | string).toISOString(),
  operationStatus: String(row.operation_status),
  confirmationStatus: parseConfirmationStatus(row.confirmation_status),
  attendanceReceivedAt: row.received_at
    ? new Date(row.received_at as Date | string).toISOString()
    : null,
  attendanceCheckoutAt: row.checkout_at
    ? new Date(row.checkout_at as Date | string).toISOString()
    : null,
  punctualityStatus: row.punctuality_status
    ? (String(row.punctuality_status) as PunctualityStatus)
    : null,
});
