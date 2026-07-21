import type { OperationKind, OperationStatus } from "./operation";
import type { EmployeeType } from "../constants/employee-types";

export interface DeactivationImpactAssignment {
  assignmentId: string;
  operationId: string;
  operationName: string;
  operationType: OperationKind;
  workdayId: string | null;
  employeeWorkdayId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  status: OperationStatus;
  locationName: string;
  workTeamName: string | null;
}

export interface EmployeeDeactivationImpact {
  collaboratorId: string;
  canDeactivateDirectly: boolean;
  requiresConfirmation: boolean;
  affectedAssignmentsCount: number;
  affectedWorkdaysCount: number;
  affectedAssignments: DeactivationImpactAssignment[];
  activeWorkTeamMemberships: Array<{ workTeamId: string; workTeamName: string }>;
}

export interface DeactivateEmployeeInput {
  confirmAffectedRelease?: boolean;
  profile?: {
    name?: string;
    documentNumber?: string | null;
    phoneNumber?: string;
    employeeType?: EmployeeType;
    categoryId?: string | null;
  };
}
