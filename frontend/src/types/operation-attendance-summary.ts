import type { PaginationMeta } from "./api";
import type { AssignmentConfirmationStatus } from "./assignment-confirmation";
import type { AttendanceRecord, OperationalStatus } from "./attendance";
import type { Employee } from "./employee";
import type { Operation } from "./operation";
import type { Service } from "./service";

export interface OperationAttendanceSummaryEmployee {
  assignmentId: string;
  employee: Employee;
  attendance: AttendanceRecord | null;
  operationalStatus: OperationalStatus;
  confirmationStatus: AssignmentConfirmationStatus;
  confirmedAt: string | null;
  unavailableAt: string | null;
}

export interface OperationAttendanceSummaryResponse {
  operation: Operation & { service: Service };
  summary: {
    assigned: number;
    checkedIn: number;
    valid: number;
    pendingReview: number;
    rejected: number;
    withoutCheckIn: number;
    confirmedEmployees: number;
    pendingConfirmationEmployees: number;
    unavailableEmployees: number;
  };
  employees: OperationAttendanceSummaryEmployee[];
  meta: PaginationMeta;
}

export interface OperationAttendanceSummaryFilters {
  page?: number;
  limit?: number;
}
