import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "../types/domain";
import type { EmployeeAssignedInventory } from "../types/employee-assignment-query";

const parseConfirmationStatus = (value: unknown): AssignmentConfirmationStatus => {
  const status = String(value ?? "PENDING");
  if (status === "CONFIRMED" || status === "UNAVAILABLE") {
    return status;
  }
  return "PENDING";
};

export const mapEmployeeAssignedInventoryRow = (
  row: Record<string, unknown>,
): EmployeeAssignedInventory => ({
  inventoryId: String(row.inventory_id),
  storeName: String(row.store_name),
  storeAddress: row.store_address ? String(row.store_address) : null,
  storeLatitude: row.store_latitude === null || row.store_latitude === undefined ? null : Number(row.store_latitude),
  storeLongitude:
    row.store_longitude === null || row.store_longitude === undefined ? null : Number(row.store_longitude),
  scheduledStart: new Date(row.scheduled_start as Date | string).toISOString(),
  scheduledEnd: new Date(row.scheduled_end as Date | string).toISOString(),
  inventoryStatus: String(row.inventory_status),
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
