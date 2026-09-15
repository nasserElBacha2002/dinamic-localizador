import type { Employee } from "./employee";
import type { OperationStatus } from "./operation-status";
import type { OperationShiftVersionDay, ScheduleMode } from "./operation-shift";
import type { OperationScheduleSummary, OperationScheduleView } from "./schedule";
import type { Service, ServiceSummary } from "./service";

export type { OperationStatus } from "./operation-status";
export type { ScheduleMode } from "./operation-shift";

export type OperationKind = "ONE_TIME" | "RECURRING";

export interface Operation {
  id: string;
  serviceId: string;
  operationKind: OperationKind;
  /** Defaults to SINGLE when omitted (backward compatible). */
  scheduleMode?: ScheduleMode;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  earlyToleranceSource: "COMPANY_DEFAULT" | "CUSTOM";
  lateToleranceSource: "COMPANY_DEFAULT" | "CUSTOM";
  status: OperationStatus;
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
  assignmentOrigin?: "MANUAL" | "WORK_TEAM" | "SYSTEM" | "COVERAGE";
  operationShiftId?: string | null;
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

export type CreateOperationShiftSeedInput = {
  code: string;
  name: string;
  templateId?: string | null;
  sortOrder?: number;
  startTime: string;
  endTime: string;
  days?: OperationShiftVersionDay[];
};

export interface CreateOneTimeOperationInput {
  operationKind: "ONE_TIME";
  serviceId: string;
  scheduledStart: string;
  scheduledEnd?: string | null;
  earlyToleranceMinutes?: number | null;
  lateToleranceMinutes?: number | null;
  scheduleMode?: ScheduleMode;
  shifts?: CreateOperationShiftSeedInput[];
}

export interface CreateRecurringOperationInput {
  operationKind: "RECURRING";
  serviceId: string;
  validFrom: string;
  validUntil?: string | null;
  scheduleSource: "COMPANY" | "CUSTOM";
  scheduleDays?: import("./schedule").WeeklyScheduleDay[];
  earlyToleranceMinutes?: number | null;
  lateToleranceMinutes?: number | null;
  scheduleMode?: ScheduleMode;
  shifts?: CreateOperationShiftSeedInput[];
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
  earlyToleranceMinutes?: number | null;
  lateToleranceMinutes?: number | null;
  status?: OperationStatus;
}
