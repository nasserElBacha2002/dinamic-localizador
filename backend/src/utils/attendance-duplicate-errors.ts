import { matchesDuplicateKeyConstraint } from "./sql-server-errors";

/**
 * Current unique indexes for one active real / simulation attendance per workday.
 * Defined in database/migrations/039_workday_domain_foundation.sql.
 */
const ACTIVE_REAL_ATTENDANCE_INDEX = "UX_attendance_records_employee_workday_active_real";
const ACTIVE_SIMULATION_ATTENDANCE_INDEX =
  "UX_attendance_records_employee_workday_active_simulation";

/**
 * Legacy / pre-workday unique indexes that still may surface on older DBs or residual indexes.
 * - inventory: database/migrations/002_core_domain.sql
 * - bare employee_workday_active: created then dropped in 039 (compat for residual error text)
 */
const LEGACY_ACTIVE_ATTENDANCE_INDEXES = [
  "UX_attendance_records_inventory_employee_active",
  "UX_attendance_records_employee_workday_active",
] as const;

export const isActiveRealAttendanceDuplicateKeyError = (error: unknown): boolean =>
  matchesDuplicateKeyConstraint(error, ACTIVE_REAL_ATTENDANCE_INDEX);

export const isActiveSimulationAttendanceDuplicateKeyError = (error: unknown): boolean =>
  matchesDuplicateKeyConstraint(error, ACTIVE_SIMULATION_ATTENDANCE_INDEX);

export const isActiveAttendanceDuplicateKeyError = (error: unknown): boolean =>
  isActiveRealAttendanceDuplicateKeyError(error) ||
  isActiveSimulationAttendanceDuplicateKeyError(error);

/** Source MessageSid unique constraint on attendance_records. */
export const isAttendanceSourceMessageSidDuplicateKeyError = (error: unknown): boolean =>
  matchesDuplicateKeyConstraint(error, "UQ_attendance_records_source_message_sid");

/** Checkout MessageSid unique constraint on attendance_records. */
export const isAttendanceCheckoutMessageSidDuplicateKeyError = (error: unknown): boolean =>
  matchesDuplicateKeyConstraint(error, "UQ_attendance_records_checkout_message_sid");

/**
 * Explicit legacy active-attendance unique indexes (exact names only).
 * Does not use prefix matching — `_real` / `_simulation` are handled by
 * {@link isActiveAttendanceDuplicateKeyError}.
 */
export const isLegacyInventoryActiveAttendanceDuplicateKeyError = (error: unknown): boolean =>
  LEGACY_ACTIVE_ATTENDANCE_INDEXES.some((indexName) =>
    matchesDuplicateKeyConstraint(error, indexName),
  );
