import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "./domain";

export interface EmployeeAssignedOperation {
  assignmentId: string;
  operationId: string;
  operationKind: string;
  operationWorkdayId: string;
  employeeWorkdayId: string | null;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  serviceLatitude: number | null;
  serviceLongitude: number | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  operationStatus: string;
  confirmationStatus: AssignmentConfirmationStatus;
  attendanceReceivedAt: string | null;
  attendanceCheckoutAt: string | null;
  punctualityStatus: PunctualityStatus | null;
}
