export const WORK_TEAM_ASSIGNMENT_BATCH_STATUSES = [
  "PREVIEWED",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "STALE",
] as const;
export type WorkTeamAssignmentBatchStatus = (typeof WORK_TEAM_ASSIGNMENT_BATCH_STATUSES)[number];

export const WORK_TEAM_ASSIGNMENT_ITEM_RESULTS = ["ADDED", "SKIPPED"] as const;
export type WorkTeamAssignmentItemResult = (typeof WORK_TEAM_ASSIGNMENT_ITEM_RESULTS)[number];

export const WORK_TEAM_ASSIGNMENT_SKIP_REASONS = [
  "already_assigned",
  "duplicate_in_request",
  "assignment_period_overlap",
  "employee_inactive",
  "employee_not_found",
] as const;
export type WorkTeamAssignmentSkipReason = (typeof WORK_TEAM_ASSIGNMENT_SKIP_REASONS)[number];

export const ASSIGNMENT_ORIGINS = ["MANUAL", "WORK_TEAM", "SYSTEM"] as const;
export type AssignmentOrigin = (typeof ASSIGNMENT_ORIGINS)[number];

export const WORK_TEAM_PREVIEW_TTL_MINUTES = 30;
