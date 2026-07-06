import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "./domain";

export interface EmployeeAssignedOperation {
  operationId: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  serviceLatitude: number | null;
  serviceLongitude: number | null;
  scheduledStart: string;
  scheduledEnd: string;
  operationStatus: string;
  confirmationStatus: AssignmentConfirmationStatus;
  attendanceReceivedAt: string | null;
  attendanceCheckoutAt: string | null;
  punctualityStatus: PunctualityStatus | null;
}
