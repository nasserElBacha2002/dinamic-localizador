import type {
  AttendanceStatisticsSummary,
  StatisticsActionExceptionItem,
  StatisticsActionExceptionKey,
} from "../types/statistics";
import { roundRate } from "./attendance-statistics-metrics";

export type {
  StatisticsActionExceptionItem,
  StatisticsActionExceptionKey,
} from "../types/statistics";

const EXCEPTION_LABELS: Record<StatisticsActionExceptionKey, string> = {
  open_attendance: "Jornadas sin cierre",
  unjustified_absence: "Ausencias no justificadas",
  outside_geofence: "Fuera de geocerca",
  pending_review: "Pendientes de revisión",
  late_arrival: "Llegadas tarde",
  early_departure: "Salidas tempranas",
  coverage_required: "Operaciones con reemplazo",
  operation_modified: "Operaciones modificadas",
  not_confirmed: "Sin confirmar asistencia",
  missing_check_in: "Salida sin llegada",
  missing_check_out: "Llegada sin salida",
  no_punch: "Sin fichaje",
};

const INCIDENT_EXCEPTION_KEYS = new Set<StatisticsActionExceptionKey>([
  "coverage_required",
  "operation_modified",
  "not_confirmed",
  "missing_check_in",
  "missing_check_out",
  "no_punch",
]);

const rateOrNull = (count: number, denominator: number): number | null =>
  denominator > 0 ? roundRate(count, denominator) : null;

/**
 * Non-exclusive action categories with per-exception denominators.
 * When operationalIncidents is null (unavailable), incident exception keys are skipped.
 */
export const buildActionExceptions = (
  summary: AttendanceStatisticsSummary,
): StatisticsActionExceptionItem[] => {
  const consolidatedRequired = summary.presentWorkdays + summary.absentWorkdays;
  const punctualityEligible = summary.onTimeWorkdays + summary.lateWorkdays;
  const startedWorkdays = summary.presentWorkdays;
  const locationEvaluable =
    summary.locationEvaluableWorkdays ?? summary.presentWorkdays;
  const validationEvaluable =
    summary.validationEvaluableWorkdays ?? summary.presentWorkdays;
  const checkoutEvaluable =
    summary.checkoutEvaluableWorkdays ??
    Math.max(0, summary.presentWorkdays - summary.openAttendanceWorkdays);
  const incidents = summary.operationalIncidents;

  const items: Array<{
    key: StatisticsActionExceptionKey;
    count: number;
    denominator: number;
  }> = [
    {
      key: "open_attendance",
      count: summary.openAttendanceWorkdays,
      denominator: startedWorkdays,
    },
    {
      key: "unjustified_absence",
      count: summary.absentWorkdays,
      denominator: consolidatedRequired,
    },
    {
      key: "outside_geofence",
      count: summary.outsideGeofenceCount,
      denominator: locationEvaluable,
    },
    {
      key: "pending_review",
      count: summary.pendingReviewCount,
      denominator: validationEvaluable,
    },
    {
      key: "late_arrival",
      count: summary.lateWorkdays,
      denominator: punctualityEligible,
    },
    {
      key: "early_departure",
      count: summary.earlyDepartureWorkdays,
      denominator: checkoutEvaluable,
    },
  ];

  if (incidents != null) {
    const changeDenominator =
      incidents.changeTraceableOperations > 0
        ? incidents.changeTraceableOperations
        : incidents.evaluableOperations;
    items.push(
      {
        key: "coverage_required",
        count: incidents.operationsWithCoverage,
        denominator: incidents.evaluableOperations,
      },
      {
        key: "operation_modified",
        count: incidents.modifiedOperations,
        denominator: changeDenominator,
      },
      {
        key: "not_confirmed",
        count: incidents.notConfirmedBeforeStart,
        denominator: incidents.confirmationEligibleAssignments,
      },
      {
        key: "missing_check_in",
        count: incidents.missingCheckIn,
        denominator: incidents.punchEvaluableWorkdays,
      },
      {
        key: "missing_check_out",
        count: incidents.missingCheckOut,
        denominator: incidents.punchEvaluableWorkdays,
      },
      {
        key: "no_punch",
        count: incidents.noPunch,
        denominator: incidents.punchEvaluableWorkdays,
      },
    );
  }

  return items
    .filter((item) => {
      if (incidents == null && INCIDENT_EXCEPTION_KEYS.has(item.key)) {
        return false;
      }
      return item.count > 0;
    })
    .sort((a, b) => b.count - a.count)
    .map((item) => ({
      key: item.key,
      status: item.key,
      label: EXCEPTION_LABELS[item.key],
      count: item.count,
      rate: rateOrNull(item.count, item.denominator),
      denominator: item.denominator,
    }));
};
