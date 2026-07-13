import type { Employee } from "./domain";
import type { AssignmentOrigin } from "../constants/work-team-assignment";
import type {
  WorkTeamAssignmentBatchStatus,
  WorkTeamAssignmentItemResult,
  WorkTeamAssignmentSkipReason,
} from "../constants/work-team-assignment";

export interface WorkTeam {
  id: string;
  companyId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  memberCount?: number;
  activeMemberCount?: number;
  usageCount?: number;
}

export interface WorkTeamMember {
  workTeamId: string;
  employeeId: string;
  createdAt: string;
  createdBy: string | null;
  employee?: Employee;
}

export interface WorkTeamDetail extends WorkTeam {
  members: WorkTeamMember[];
}

export interface WorkTeamAssignmentBatch {
  id: string;
  companyId: string;
  operationId: string;
  requestedBy: string | null;
  requestedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  status: WorkTeamAssignmentBatchStatus;
  previewExpiresAt: string | null;
  membersSnapshotHash: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface WorkTeamAssignmentBatchTeam {
  batchId: string;
  workTeamId: string;
  workTeamNameSnapshot: string;
  workTeamUpdatedAtSnapshot: string;
  membersSnapshotHash: string;
}

export interface WorkTeamAssignmentBatchItem {
  id: string;
  batchId: string;
  workTeamId: string | null;
  employeeId: string;
  operationAssignmentId: string | null;
  result: WorkTeamAssignmentItemResult;
  reason: WorkTeamAssignmentSkipReason | null;
  createdAt: string;
  employee?: Employee;
}

export interface WorkTeamUsageRecord {
  batchId: string;
  operationId: string;
  operationName: string | null;
  serviceName: string | null;
  operationKind: string;
  operationStatus: string;
  requestedAt: string;
  requestedBy: string | null;
  requestedByName: string | null;
  validFrom: string | null;
  validUntil: string | null;
  addedCount: number;
  skippedCount: number;
  topSkipReasons: string[];
}

export interface AssignmentSourceInfo {
  assignmentOrigin: AssignmentOrigin;
  sourceAssignmentBatchId: string | null;
  sourceWorkTeamId: string | null;
  sourceWorkTeamName: string | null;
}
