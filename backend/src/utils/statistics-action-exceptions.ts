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
};

const rateOrNull = (count: number, denominator: number): number | null =>
  denominator > 0 ? roundRate(count, denominator) : null;

/**
 * Non-exclusive action categories with per-exception denominators.
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

  return items
    .filter((item) => item.count > 0)
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
