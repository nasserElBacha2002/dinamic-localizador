export interface SeedEmployee {
  id: string;
  name: string;
}

export interface SeedService {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  locationZoneId: string | null;
}

export type AttendanceOutcome = "on_time" | "late" | "none";

export type AssignmentMode = "individual" | "work_team";

export interface ClusterPlan {
  index: number;
  employeeIds: string[];
  favoriteServiceIds: string[];
}

export interface WorkTeamPlan {
  index: number;
  name: string;
  description: string;
  employeeIds: string[];
}

export interface PlannedAssignment {
  employeeId: string;
  attendance: AttendanceOutcome;
}

export interface PlannedOperation {
  index: number;
  workDate: string;
  /** Local wall-clock hour in company TZ (0-23). */
  startHour: number;
  durationHours: number;
  serviceId: string;
  mode: AssignmentMode;
  workTeamIndex: number | null;
  assignments: PlannedAssignment[];
  label: string;
}

export interface HistoricalSeedEstimates {
  operations: number;
  workdays: number;
  individualAssignments: number;
  teamAssignments: number;
  employeeWorkdays: number;
  attendanceRecords: number;
  workTeams: number;
}

export interface HistoricalSeedPlan {
  batchId: string;
  companyId: string;
  seed: number;
  monthsBack: number;
  timezone: string;
  clusters: ClusterPlan[];
  workTeams: WorkTeamPlan[];
  operations: PlannedOperation[];
  estimates: HistoricalSeedEstimates;
  /** Top expected co-occurrence pairs (employeeId pairs) for manual QA. */
  expectedStrongPairs: Array<{ leftId: string; rightId: string; sharedOps: number }>;
}

export interface HistoricalSeedCliOptions {
  companyId: string | null;
  operations: number;
  monthsBack: number;
  seed: number;
  batchId: string | null;
  dryRun: boolean;
  cleanup: string | null;
  apply: boolean;
}
