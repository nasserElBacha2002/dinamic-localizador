import type { Employee } from "./employee";
import type { OperationStatus } from "./operation-status";
import type { Service, ServiceSummary } from "./service";

export type { OperationStatus } from "./operation-status";

export interface Operation {
  id: string;
  serviceId: string;
  scheduledStart: string;
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
}

export interface OperationDetail extends Operation {
  service: Service;
  assignedEmployees: Employee[];
  attendanceRecordsCount: number;
}

export interface OperationEmployeeAssignment {
  operationId: string;
  employeeId: string;
  assignedAt: string;
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
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: OperationListSortField;
  sortDirection?: "asc" | "desc";
}

export interface CreateOperationInput {
  serviceId: string;
  scheduledStart: string;
  scheduledEnd?: string | null;
  earlyToleranceMinutes?: number;
  lateToleranceMinutes?: number;
  notes?: string | null;
}

export interface UpdateOperationInput {
  serviceId?: string;
  scheduledStart?: string;
  scheduledEnd?: string | null;
  earlyToleranceMinutes?: number;
  lateToleranceMinutes?: number;
  notes?: string | null;
  status?: OperationStatus;
}
