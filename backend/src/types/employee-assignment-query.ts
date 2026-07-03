import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "./domain";

export interface EmployeeAssignedInventory {
  inventoryId: string;
  storeName: string;
  storeAddress: string | null;
  storeLatitude: number | null;
  storeLongitude: number | null;
  scheduledStart: string;
  scheduledEnd: string;
  inventoryStatus: string;
  confirmationStatus: AssignmentConfirmationStatus;
  attendanceReceivedAt: string | null;
  attendanceCheckoutAt: string | null;
  punctualityStatus: PunctualityStatus | null;
}
