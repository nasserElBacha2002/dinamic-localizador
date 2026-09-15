/**
 * Structured multi-shift attendance observability (no lat/lng, no WhatsApp body).
 */

export type MultiShiftAttendanceLogAction =
  | "candidate_found"
  | "selection_required"
  | "selection_confirmed"
  | "session_expired"
  | "session_invalidated"
  | "check_in_created"
  | "check_in_idempotent"
  | "check_out_created"
  | "check_out_idempotent"
  | "reminder_sent"
  | "reminder_skipped"
  | "alert_sent"
  | "alert_skipped"
  | "state_conflict"
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
