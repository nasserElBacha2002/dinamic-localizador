import path from "node:path";
import { mock } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const notUsed = async () => {
  throw new Error("API mock: function not used in this test");
};

/**
 * Mock an API module by absolute file URL so Node's experimental
 * `mock.module` matches the same resolved module that hooks import.
 *
 * `exportNames` must list every named export the real module provides
 * (ESM import fails if a requested export is missing from the mock).
 */
export function mockApiModule(
  relativeFromSrc: string,
  namedExports: Record<string, unknown>,
  exportNames: readonly string[] = Object.keys(namedExports),
): void {
  const absolutePath = path.resolve(
    srcRoot,
    relativeFromSrc.endsWith(".ts") ? relativeFromSrc : `${relativeFromSrc}.ts`,
  );
  const completeExports: Record<string, unknown> = {};
  for (const name of exportNames) {
    completeExports[name] = namedExports[name] ?? notUsed;
  }
  for (const [name, value] of Object.entries(namedExports)) {
    completeExports[name] = value;
  }
  mock.module(pathToFileURL(absolutePath).href, { namedExports: completeExports });
}

export const OPERATIONS_API_EXPORTS = [
  "getOperations",
  "getOperationById",
  "createOperation",
  "updateOperation",
  "cancelOperation",
  "reactivateOperation",
  "getOperationEmployees",
  "assignEmployeeToOperation",
  "cancelOperationAssignment",
  "unassignEmployeeFromOperation",
  "endOperationAssignment",
  "getOperationAttendanceSummary",
  "getOperationWorkdays",
  "getOperationWorkdayDetail",
  "materializeOperationWorkdays",
  "previewOperationImport",
  "confirmOperationImport",
] as const;

export const WORK_TEAMS_API_EXPORTS = [
  "getWorkTeams",
  "getWorkTeamById",
  "createWorkTeam",
  "updateWorkTeam",
  "activateWorkTeam",
  "deactivateWorkTeam",
  "replaceWorkTeamMembers",
  "getWorkTeamUsage",
  "previewWorkTeamAssignment",
  "confirmWorkTeamAssignment",
  "getWorkTeamAssignmentBatch",
] as const;

export const ATTENDANCE_API_EXPORTS = [
  "getAttendanceRecords",
  "getAttendanceById",
  "createAttendanceRecord",
  "getAttendanceReviews",
  "reviewAttendanceRecord",
  "exportAttendanceCsv",
] as const;

export const ABSENCES_API_EXPORTS = [
  "getAbsenceTypes",
  "getAbsenceRequests",
  "getAbsenceRequestById",
  "createAbsenceRequest",
  "approveAbsenceRequest",
  "rejectAbsenceRequest",
  "needsInfoAbsenceRequest",
  "cancelAbsenceRequest",
  "getEmployeeAbsenceBalances",
  "upsertEmployeeAbsenceBalance",
] as const;
