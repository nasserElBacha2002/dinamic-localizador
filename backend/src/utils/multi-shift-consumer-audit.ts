/**
 * Phase 2 consumer audit: MULTI_SHIFT readiness of write/read paths that historically
 * assumed one operation_workday per (operation, date).
 *
 * REJECT = caller must assertSingleScheduleModeOrReject (or equivalent) before writes.
 * SAFE = keyed by employee_workday_id / already multi-aware / no single-workday assumption.
 * HOLD = MULTI-aware with reduced behavior (no full Phase 3 support).
 */
export const MULTI_SHIFT_CONSUMER_AUDIT = [
  {
    consumer: "attendance-reminder.service (job candidates)",
    disposition: "SAFE",
    notes: "Candidates join employee_workdays → operation_workdays by id; works per shift row.",
  },
  {
    consumer: "attendance-reminder.service sendTestReminder",
    disposition: "REJECT",
    evidence: "attendance-reminder.service.ts:assertSingleScheduleModeOrReject before candidate lookup",
    notes: "Test send by operation+employee without shift can pick the wrong workday.",
  },
  {
    consumer: "admin-alert-missing-checkin.service",
    disposition: "REJECT",
    evidence: "admin-alert-missing-checkin.service.ts:assertSingleScheduleModeOrReject",
    notes: "ONE_TIME completion threshold still assumes single workday semantics.",
  },
  {
    consumer: "statistics.repository (work_date grain)",
    disposition: "SAFE",
    notes: "EmployeeWorkday statistics projection; date grain is intentional aggregation.",
  },
  {
    consumer: "imports (operation-import.service)",
    disposition: "REJECT",
    evidence: "Phase 2: import creates SINGLE ONE_TIME only; no MULTI write path adapted",
    notes: "Out of scope for Phase 2 multi-turno; do not import into MULTI operations.",
  },
  {
    consumer: "one-time-schedule-consistency.inspector",
    disposition: "REJECT",
    evidence: "one-time-schedule-consistency.inspector.ts:MULTI_SHIFT_NOT_SUPPORTED_HERE",
    notes: "MULTIPLE_OPERATION_WORKDAYS / single expected snapshot assumes SINGLE.",
  },
  {
    consumer: "one-time-operation-schedule-reconciliation.service",
    disposition: "REJECT",
    evidence: "one-time-operation-schedule-reconciliation.service.ts:MULTI_SHIFT_NOT_SUPPORTED_HERE",
    notes: "Rejects MULTI before reconcile writes.",
  },
  {
    consumer: "operation.repository findDetailById (employees via workdays[0])",
    disposition: "REJECT",
    evidence: "operation.repository.ts: skips workdays[0] for MULTI; uses scheduledStart for ONE_TIME date",
    notes: "Read path avoids arbitrary workday; still not a full multi employee listing contract.",
  },
  {
    consumer: "operation-attendance-workday-resolver (WhatsApp attendance)",
    disposition: "REJECT",
    evidence: "operation-attendance-workday-resolver.ts:assertSingleScheduleModeOrReject",
    notes: "WhatsApp Llegué/Terminé still SINGLE until Phase 3 multi attendance.",
  },
  {
    consumer: "absences (employee_workday_id based)",
    disposition: "SAFE",
    notes: "Absence impact attaches to employee_workday rows, not operation+date alone.",
  },
  {
    consumer: "operation-lifecycle.service",
    disposition: "HOLD",
    evidence: "operation-lifecycle.service.ts: MULTI ONE_TIME waits for all ACTIVE workdays before COMPLETE",
    notes: "Minimal multi-aware completion; no Phase 3 shift lifecycle UI.",
  },
  {
    consumer: "exports / observability dashboards",
    disposition: "SAFE",
    notes: "No operation_workdays[0] write paths found; date-grain reports remain intentional.",
  },
  {
    consumer: "work-teams assignment apply",
    disposition: "REJECT",
    evidence: "Assignments go through operation-assignment paths which require shift under MULTI",
    notes: "Team apply without shift distribution is blocked by MULTI assignment rules.",
  },
  {
    consumer: "workday-materialization.ensureOneTimeOperationMaterialized",
    disposition: "REJECT",
    evidence: "workday-materialization.service.ts: MULTI_SHIFT_USE_MULTI_MATERIALIZER before any write",
    notes: "Separate ensureMultiShiftOperationWorkdays for multi collection.",
  },
] as const;

export type MultiShiftConsumerAuditEntry = (typeof MULTI_SHIFT_CONSUMER_AUDIT)[number];
