/**
 * Structured multi-shift attendance observability (no lat/lng, no WhatsApp body/phone).
 * Only actions with real producers are listed.
 */

export type MultiShiftAttendanceLogAction =
  | "selection_required"
  | "selection_confirmed"
  | "session_invalidated"
  | "state_conflict"
  | "reminder_claimed"
  | "reminder_sent"
  | "reminder_skipped"
  | "retry_recovered";

export type MultiShiftAttendanceLogFields = {
  companyId: string;
  operationId?: string | null;
  operationWorkdayId?: string | null;
  operationShiftId?: string | null;
  employeeWorkdayId?: string | null;
  workDate?: string | null;
  messageSid?: string | null;
  action: MultiShiftAttendanceLogAction;
  outcome: "ok" | "skipped" | "rejected" | "error";
  reason?: string | null;
};

export const logMultiShiftAttendanceEvent = (fields: MultiShiftAttendanceLogFields): void => {
  console.info(
    JSON.stringify({
      schemaVersion: 1,
      module: "multi-shift-attendance",
      ...fields,
      timestamp: new Date().toISOString(),
    }),
  );
};
