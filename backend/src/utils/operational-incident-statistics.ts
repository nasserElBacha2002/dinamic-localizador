/**
 * Shared predicates and labels for operational incident statistics.
 * Keep SQL fragments and TypeScript classification rules aligned.
 */

export const OPERATIONAL_INCIDENT_TYPES = [
  "COVERAGE_REQUIRED",
  "OPERATION_MODIFIED",
  "NOT_CONFIRMED",
  "NOT_CONFIRMED_AND_ABSENT",
  "MISSING_CHECK_IN",
  "MISSING_CHECK_OUT",
  "NO_PUNCH",
] as const;

export type OperationalIncidentType = (typeof OPERATIONAL_INCIDENT_TYPES)[number];

export const PUNCH_COMPLETENESS_CATEGORIES = [
  "COMPLETE",
  "MISSING_CHECK_OUT",
  "MISSING_CHECK_IN",
  "NO_PUNCH",
] as const;

export type PunchCompletenessCategory = (typeof PUNCH_COMPLETENESS_CATEGORIES)[number];

export const OPERATIONAL_INCIDENT_LABELS: Record<OperationalIncidentType, string> = {
  COVERAGE_REQUIRED: "Cobertura / reemplazo",
  OPERATION_MODIFIED: "Operación modificada",
  NOT_CONFIRMED: "Sin confirmar antes del inicio",
  NOT_CONFIRMED_AND_ABSENT: "Sin confirmar y ausente",
  MISSING_CHECK_IN: "Salida sin llegada",
  MISSING_CHECK_OUT: "Llegada sin salida",
  NO_PUNCH: "Sin fichaje",
};

/** Fields that count as human business modifications of an operation. */
export const OPERATION_BUSINESS_CHANGE_FIELDS = [
  "scheduledStart",
  "scheduledEnd",
  "serviceId",
  "earlyToleranceMinutes",
  "lateToleranceMinutes",
  "earlyToleranceSource",
  "lateToleranceSource",
] as const;

export type OperationBusinessChangeField = (typeof OPERATION_BUSINESS_CHANGE_FIELDS)[number];

/**
 * Consolidation cutoff aligned with ABSENT transition in employee_workday_statistics:
 * after expected end + late tolerance, the workday is evaluable for incomplete punches.
 * Uses raw ar/ow join aliases.
 */
export const PUNCH_CONSOLIDATED_SQL = `
  @referenceAt > DATEADD(
    MINUTE,
    ow.late_tolerance_minutes,
    COALESCE(ow.expected_end_at, ow.expected_start_at)
  )
`;

/**
 * Valid arrival for punch completeness: operationally accepted attendance with received_at.
 * Exit-only rows have checkout without received_at → MISSING_CHECK_IN.
 */
export const PUNCH_HAS_ARRIVAL_SQL = `
  (
    ar.id IS NOT NULL
    AND ar.received_at IS NOT NULL
    AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
  )
`;

export const PUNCH_HAS_CHECKOUT_SQL = `
  (ar.id IS NOT NULL AND ar.checkout_at IS NOT NULL)
`;

export const PUNCH_COMPLETENESS_SQL = `
  CASE
    WHEN ew.expectation_status IN (N'CANCELLED', N'JUSTIFIED') THEN NULL
    WHEN o.status = N'CANCELLED' THEN NULL
    WHEN NOT (${PUNCH_CONSOLIDATED_SQL}) THEN NULL
    WHEN ${PUNCH_HAS_ARRIVAL_SQL} AND ${PUNCH_HAS_CHECKOUT_SQL} THEN N'COMPLETE'
    WHEN ${PUNCH_HAS_ARRIVAL_SQL} AND NOT ${PUNCH_HAS_CHECKOUT_SQL} THEN N'MISSING_CHECK_OUT'
    WHEN NOT ${PUNCH_HAS_ARRIVAL_SQL} AND ${PUNCH_HAS_CHECKOUT_SQL} THEN N'MISSING_CHECK_IN'
    ELSE N'NO_PUNCH'
  END
`;

/**
 * Punch completeness over `employee_workday_statistics` CTE column names
 * (not raw ar/ow joins). Keep aligned with {@link classifyPunchCompleteness}.
 */
export const PUNCH_CONSOLIDATED_FROM_WORKDAY_STATS_SQL = `
  @referenceAt > DATEADD(
    MINUTE,
    late_tolerance_minutes,
    COALESCE(expected_end_at, expected_start_at)
  )
`;

export const PUNCH_HAS_ARRIVAL_FROM_WORKDAY_STATS_SQL = `
  (
    check_in_at IS NOT NULL
    AND validation_status IN (N'VALID', N'PENDING_REVIEW')
  )
`;

export const PUNCH_HAS_CHECKOUT_FROM_WORKDAY_STATS_SQL = `
  (check_out_at IS NOT NULL)
`;

export const PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL = `
  CASE
    WHEN expectation_status IN (N'CANCELLED', N'JUSTIFIED') THEN NULL
    WHEN operation_status = N'CANCELLED' THEN NULL
    WHEN NOT (${PUNCH_CONSOLIDATED_FROM_WORKDAY_STATS_SQL}) THEN NULL
    WHEN ${PUNCH_HAS_ARRIVAL_FROM_WORKDAY_STATS_SQL}
     AND ${PUNCH_HAS_CHECKOUT_FROM_WORKDAY_STATS_SQL} THEN N'COMPLETE'
    WHEN ${PUNCH_HAS_ARRIVAL_FROM_WORKDAY_STATS_SQL}
     AND NOT ${PUNCH_HAS_CHECKOUT_FROM_WORKDAY_STATS_SQL} THEN N'MISSING_CHECK_OUT'
    WHEN NOT ${PUNCH_HAS_ARRIVAL_FROM_WORKDAY_STATS_SQL}
     AND ${PUNCH_HAS_CHECKOUT_FROM_WORKDAY_STATS_SQL} THEN N'MISSING_CHECK_IN'
    ELSE N'NO_PUNCH'
  END
`;

export const emptyOperationalIncidentSummary = () => ({
  availability: "AVAILABLE" as const,
  operationsWithAnyIncident: 0,
  operationsWithCoverage: 0,
  coverageEvents: 0,
  modifiedOperations: 0,
  operationChangeEvents: 0,
  operationsWithUnconfirmedAssignments: 0,
  notConfirmedBeforeStart: 0,
  notConfirmedAndAbsent: 0,
  operationsWithIncompletePunches: 0,
  incompleteWorkdays: 0,
  missingCheckIn: 0,
  missingCheckOut: 0,
  noPunch: 0,
  evaluableOperations: 0,
  confirmationEligibleAssignments: 0,
  punchEvaluableWorkdays: 0,
  changeTraceableOperations: 0,
  /** Metrics from operation_change_events only (post-deploy). */
  changeEventsReliableFrom: null as string | null,
  /**
   * Earliest company-local date from which coverage events are fully reliable.
   * Null when no coverage events exist yet.
   */
  coverageReliableFrom: null as string | null,
  /**
   * True only when backfill + explicit events cover the requested period.
   * Never unconditionally true.
   */
  coverageEventsReliableHistorically: false,
});

export type OperationalIncidentSummaryMetrics = ReturnType<typeof emptyOperationalIncidentSummary>;

export const classifyPunchCompleteness = (input: {
  expectationStatus: string;
  operationStatus: string;
  referenceAt: Date;
  expectedEndAt: Date | null;
  expectedStartAt: Date;
  lateToleranceMinutes: number;
  hasValidArrival: boolean;
  hasCheckout: boolean;
}): PunchCompletenessCategory | null => {
  if (
    input.expectationStatus === "CANCELLED" ||
    input.expectationStatus === "JUSTIFIED" ||
    input.operationStatus === "CANCELLED"
  ) {
    return null;
  }

  const endBase = input.expectedEndAt ?? input.expectedStartAt;
  const consolidatedAt = new Date(
    endBase.getTime() + input.lateToleranceMinutes * 60_000,
  );
  if (input.referenceAt.getTime() <= consolidatedAt.getTime()) {
    return null;
  }

  if (input.hasValidArrival && input.hasCheckout) {
    return "COMPLETE";
  }
  if (input.hasValidArrival && !input.hasCheckout) {
    return "MISSING_CHECK_OUT";
  }
  if (!input.hasValidArrival && input.hasCheckout) {
    return "MISSING_CHECK_IN";
  }
  return "NO_PUNCH";
};

export const detectOperationBusinessChanges = (
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): OperationBusinessChangeField[] => {
  const changed: OperationBusinessChangeField[] = [];
  for (const field of OPERATION_BUSINESS_CHANGE_FIELDS) {
    const before = previous[field] ?? null;
    const after = next[field] ?? null;
    if (String(before ?? "") !== String(after ?? "")) {
      changed.push(field);
    }
  }
  return changed;
};
