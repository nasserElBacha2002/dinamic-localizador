import { isDuplicateKeyError } from "./sql-server-errors";

const ACTIVE_REAL_ATTENDANCE_INDEX = "UX_attendance_records_employee_workday_active_real";
const ACTIVE_SIMULATION_ATTENDANCE_INDEX =
  "UX_attendance_records_employee_workday_active_simulation";

const includesIndexName = (error: unknown, indexName: string): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === "string"
        ? String((error as { message: string }).message)
        : String(error);

  return message.includes(indexName);
};

export const isActiveRealAttendanceDuplicateKeyError = (error: unknown): boolean =>
  isDuplicateKeyError(error) && includesIndexName(error, ACTIVE_REAL_ATTENDANCE_INDEX);

export const isActiveSimulationAttendanceDuplicateKeyError = (error: unknown): boolean =>
  isDuplicateKeyError(error) && includesIndexName(error, ACTIVE_SIMULATION_ATTENDANCE_INDEX);

export const isActiveAttendanceDuplicateKeyError = (error: unknown): boolean =>
  isActiveRealAttendanceDuplicateKeyError(error) ||
  isActiveSimulationAttendanceDuplicateKeyError(error);
