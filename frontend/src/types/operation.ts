import type { Employee } from "./employee";
import type { OperationStatus } from "./operation-status";
import type { OperationScheduleSummary, OperationScheduleView } from "./schedule";
import type { Service, ServiceSummary } from "./service";

export type { OperationStatus } from "./operation-status";

export type OperationKind = "ONE_TIME" | "RECURRING";

export interface Operation {
  id: string;
  serviceId: string;
  operationKind: OperationKind;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  status: OperationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationWithService extends Operation {
  service: ServiceSummary;
  scheduleSummary?: OperationScheduleSummary;
}

export interface OperationDetail extends Operation {
  service: Service;
  assignedEmployees: Employee[];
  attendanceRecordsCount: number;
  schedule?: OperationScheduleView;
}

export type AssignmentLifecycleState = "CURRENT" | "FUTURE" | "ENDED";

export interface OperationEmployeeAssignment {
  id: string;
  companyId: string;
  operationId: string;
  employeeId: string;
  validFrom: string;
  validUntil: string | null;
  assignedAt: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
  lifecycleState?: AssignmentLifecycleState;
  assignmentOrigin?: "MANUAL" | "WORK_TEAM" | "SYSTEM";
  sourceAssignmentBatchId?: string | null;
  sourceWorkTeamId?: string | null;
  sourceWorkTeamName?: string | null;
  employee?: Employee;
}

export type OperationListSortField =
  | "serviceName"
  | "serviceAddress"
  | "scheduledStart"
  | "scheduledEnd"
  | "status"
  | "earlyToleranceMinutes"
  | "lateToleranceMinutes";

export interface OperationFilters {
  page?: number;
  limit?: number;
  status?: OperationStatus;
  serviceId?: string;
  operationKind?: OperationKind;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: OperationListSortField;
  sortDirection?: "asc" | "desc";
}

export interface CreateOneTimeOperationInput {
  operationKind: "ONE_TIME";
  serviceId: string;
  scheduledStart: string;
  scheduledEnd?: string | null;
  earlyToleranceMinutes?: number;
  lateToleranceMinutes?: number;
  notes?: string | null;
}

export interface CreateRecurringOperationInput {
  operationKind: "RECURRING";
  serviceId: string;
  validFrom: string;
  validUntil?: string | null;
  scheduleSource: "COMPANY" | "CUSTOM";
  scheduleDays?: import("./schedule").WeeklyScheduleDay[];
  earlyToleranceMinutes?: number;
  lateToleranceMinutes?: number;
  notes?: string | null;
}

export type CreateOperationInput = CreateOneTimeOperationInput | CreateRecurringOperationInput;

export interface UpdateOperationInput {
  serviceId?: string;
  scheduledStart?: string;
  scheduledEnd?: string | null;
  validFrom?: string;
  validUntil?: string | null;
  scheduleSource?: "COMPANY" | "CUSTOM";
  scheduleDays?: import("./schedule").WeeklyScheduleDay[];
  earlyToleranceMinutes?: number;
  lateToleranceMinutes?: number;
  notes?: string | null;
  status?: OperationStatus;
}
