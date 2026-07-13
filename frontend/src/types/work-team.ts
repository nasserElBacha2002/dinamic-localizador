import type { Employee } from "./employee";

export interface WorkTeam {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  activeMemberCount?: number;
  usageCount?: number;
}

export interface WorkTeamMember {
  workTeamId: string;
  employeeId: string;
  createdAt: string;
  employee?: Employee;
}

export interface WorkTeamDetail extends WorkTeam {
  members: WorkTeamMember[];
}

export interface WorkTeamFilters {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean;
  sortBy?: "name" | "updatedAt" | "memberCount" | "activeMemberCount";
  sortDirection?: "asc" | "desc";
}

export interface CreateWorkTeamInput {
  name: string;
  description?: string | null;
  employeeIds?: string[];
}

export interface UpdateWorkTeamInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface WorkTeamUsageRecord {
  batchId: string;
  operationId: string;
  operationName: string | null;
  serviceName: string | null;
  operationKind: string;
  operationStatus: string;
  requestedAt: string;
  requestedByName: string | null;
  validFrom: string | null;
  validUntil: string | null;
  addedCount: number;
  skippedCount: number;
  topSkipReasons: Array<{ reason: WorkTeamAssignmentSkipReason; count: number }>;
}

export type WorkTeamAssignmentSkipReason =
  | "already_assigned"
  | "duplicate_in_request"
  | "assignment_period_overlap"
  | "employee_inactive"
  | "employee_not_found";

export interface WorkTeamAssignPreviewResult {
  operationId: string;
  previewToken: string;
  validFrom: string;
  validUntil: string | null;
  groups: Array<{
    workTeamId: string;
    workTeamName: string;
    updatedAt: string;
    members: Employee[];
  }>;
  assignableEmployees: Array<{
    employeeId: string;
    employee: Employee;
    workTeamIds: string[];
  }>;
  skippedEmployees: Array<{
    employeeId: string;
    employee: Employee;
    workTeamIds: string[];
    reason: WorkTeamAssignmentSkipReason;
  }>;
  summary: {
    requestedMemberships: number;
    uniqueEmployees: number;
    assignable: number;
    skipped: number;
  };
}

export interface WorkTeamAssignConfirmResult {
  batchId: string;
  operationId: string;
  addedEmployees: Array<{
    employeeId: string;
    assignmentId: string;
    workTeamId: string | null;
    workTeamIds?: string[];
  }>;
  skippedEmployees: Array<{
    employeeId: string;
    reason: WorkTeamAssignmentSkipReason;
    workTeamId: string | null;
    workTeamIds?: string[];
  }>;
  summary: {
    requested: number;
    added: number;
    skipped: number;
  };
}

export type AssignmentOrigin = "MANUAL" | "WORK_TEAM" | "SYSTEM";
