import type { OperationKind, OperationStatus } from "./operation";

export interface DeactivationImpactAssignment {
  assignmentId: string;
  operationId: string;
  operationName: string;
  operationType: OperationKind;
  workdayId: string | null;
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
  affectedAssignmentsCount: number;
  affectedAssignments: DeactivationImpactAssignment[];
  activeWorkTeamMemberships: Array<{ workTeamId: string; workTeamName: string }>;
}

export interface DeactivateEmployeeInput {
  removeActiveAndFutureAssignments?: boolean;
}
