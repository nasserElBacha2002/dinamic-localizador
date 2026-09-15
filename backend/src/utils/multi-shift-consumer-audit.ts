/**
 * Phase 3 consumer audit: MULTI_SHIFT readiness after attendance/WhatsApp adaptations.
 *
 * SAFE = employee_workday_id keyed / multi-aware
 * ADAPT = partially multi-aware (documented residual)
 * REJECT = explicit guard until redesigned
 * OUT_OF_SCOPE = Phase 4+
 */
export const MULTI_SHIFT_CONSUMER_AUDIT = [
  {
    consumer: "bot check-in/checkout flows + availability candidates",
    disposition: "SAFE",
    notes: "Selection and writes keyed by employee_workday_id; shift labels in options.",
  },
  {
    consumer: "attendance-reminder.service job",
    disposition: "SAFE",
    notes: "Claim/UQ keyed by employee_workday_id + type + schedule_version (migration 132).",
  },
  {
    consumer: "attendance-reminder.service sendTestReminder",
    disposition: "REJECT",
    evidence: "assertSingleScheduleModeOrReject — test send without shift can pick wrong EW",
    notes: "Pass employeeWorkdayId in Phase 4 admin tooling to lift.",
  },
  {
    consumer: "admin-dynamic-attendance-alert.service",
    disposition: "SAFE",
    notes: "Dedup + payload include employeeWorkdayId / shift snapshots.",
  },
  {
    consumer: "admin-alert-missing-checkin.service (legacy ONE_TIME)",
    disposition: "REJECT",
    evidence: "assertSingleScheduleModeOrReject",
    notes: "Completion-threshold adapter still SINGLE.",
  },
  {
    consumer: "operation-attendance-workday-resolver (summary)",
    disposition: "SAFE",
    notes: "MULTI requires workdayId or unambiguous workDate; never TOP 1 among shifts.",
  },
  {
    consumer: "operation-lifecycle.service",
    disposition: "SAFE",
    notes: "MULTI ONE_TIME from materialized workdays; RECURRING never auto-completes.",
  },
  {
    consumer: "absence reconciliation (interval overlap)",
    disposition: "SAFE",
    notes: "AM/PM converted to intervals; overnight spans calendar dates.",
  },
  {
    consumer: "coverage / replacements (operation-assignment)",
    disposition: "SAFE",
    notes: "Replacement inherits operationShiftId from replaced assignment.",
  },
  {
    consumer: "one-time-schedule-consistency.inspector",
    disposition: "REJECT",
    evidence: "MULTI_SHIFT_NOT_SUPPORTED_HERE",
    notes: "Single expected snapshot assumes SINGLE.",
  },
  {
    consumer: "one-time-operation-schedule-reconciliation.service",
    disposition: "REJECT",
    evidence: "MULTI_SHIFT_NOT_SUPPORTED_HERE",
  },
  {
    consumer: "workday-materialization.ensureOneTimeOperationMaterialized",
    disposition: "REJECT",
    evidence: "MULTI_SHIFT_USE_MULTI_MATERIALIZER before write",
  },
  {
    consumer: "imports / statistics / frontend",
    disposition: "OUT_OF_SCOPE",
    notes: "Phase 4.",
  },
  {
    consumer: "work-teams assign without shift",
    disposition: "REJECT",
    notes: "Core requires operationShiftId under MULTI.",
  },
] as const;

export type MultiShiftConsumerAuditEntry = (typeof MULTI_SHIFT_CONSUMER_AUDIT)[number];
