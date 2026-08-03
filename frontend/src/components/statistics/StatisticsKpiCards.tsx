import { SimpleGrid, Text } from "@mantine/core";
import { useNavigate } from "react-router";
import { MetricCard } from "../../design-system";
import type { AttendanceStatisticsSummary, PeriodMetricDelta } from "../../types/statistics";
import { formatDurationFromMinutes } from "../../utils/duration";
import { formatPercent } from "../../utils/export";
import {
  buildAttendanceExceptionHref,
  type StatisticsDeepLinkContext,
  type StatisticsExceptionLinkKey,
} from "../../utils/statistics-deep-links";

interface StatisticsKpiCardsProps {
  summary?: AttendanceStatisticsSummary;
  isLoading?: boolean;
  linkContext: StatisticsDeepLinkContext;
}

function formatDelta(delta: PeriodMetricDelta | undefined, higherIsWorse = false): string | undefined {
  if (!delta?.comparable) {
    return undefined;
  }
  const sign = delta.absoluteDelta > 0 ? "+" : "";
  const pct =
    delta.percentDelta == null ? "" : ` (${sign}${delta.percentDelta}%)`;
  const sense =
    delta.absoluteDelta === 0
      ? "sin cambio"
      : higherIsWorse
        ? delta.absoluteDelta > 0
          ? "empeora"
          : "mejora"
        : delta.absoluteDelta > 0
          ? "mejora"
          : "empeora";
  return `vs período ant.: ${sign}${delta.absoluteDelta}${pct} · ${sense}`;
}

function formatRateWithVolume(rate: number, numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return "—";
  }
  return `${formatPercent(rate)} (${numerator}/${denominator})`;
}

export function StatisticsKpiCards({ summary, isLoading, linkContext }: StatisticsKpiCardsProps) {
  const navigate = useNavigate();

  const go = (key: StatisticsExceptionLinkKey) => {
    navigate(buildAttendanceExceptionHref(key, linkContext));
  };

  const punctualityDenom = (summary?.onTimeWorkdays ?? 0) + (summary?.lateWorkdays ?? 0);
  const presentismoDenom = (summary?.presentWorkdays ?? 0) + (summary?.absentWorkdays ?? 0);

  const items: Array<{
    key: string;
    label: string;
    value: string | number;
    description?: string;
    onClick?: () => void;
    ariaLabel?: string;
  }> = [
    {
      key: "scheduled",
      label: "Jornadas consolidadas / programadas",
      value: summary?.scheduledWorkdays ?? 0,
      description: `Requeridas: ${summary?.attendanceRequiredWorkdays ?? 0} · Canceladas: ${summary?.cancelledWorkdays ?? 0}`,
    },
    {
      key: "present",
      label: "Presentes",
      value: summary?.presentWorkdays ?? 0,
    },
    {
      key: "absent",
      label: "Ausencias no justificadas",
      value: summary?.absentWorkdays ?? 0,
      description: formatDelta(summary?.comparison?.absenceRate, true),
      onClick: () => go("unjustified_absence"),
      ariaLabel: "Ver ausencias no justificadas",
    },
    {
      key: "justified",
      label: "Justificadas",
      value: summary?.justifiedWorkdays ?? 0,
    },
    {
      key: "expected",
      label: "Pendientes / esperadas",
      value: summary?.expectedOpenWorkdays ?? 0,
      description: "No cuentan como ausencias ni en presentismo",
    },
    {
      key: "attendanceRate",
      label: "Presentismo",
      value: formatRateWithVolume(
        summary?.attendanceRate ?? 0,
        summary?.presentWorkdays ?? 0,
        presentismoDenom,
      ),
      description: formatDelta(summary?.comparison?.attendanceRate),
    },
    {
      key: "punctualityRate",
      label: "Puntualidad",
      value: formatRateWithVolume(
        summary?.punctualityRate ?? 0,
        summary?.onTimeWorkdays ?? 0,
        punctualityDenom,
      ),
      description: formatDelta(summary?.comparison?.punctualityRate),
    },
    {
      key: "coverageRate",
      label: "Cobertura consolidada",
      value: formatRateWithVolume(
        summary?.coverageRate ?? 0,
        summary?.presentWorkdays ?? 0,
        presentismoDenom,
      ),
    },
    {
      key: "incompleteCoverage",
      label: "Operaciones con cobertura incompleta",
      value: summary?.incompleteCoverageOperations ?? 0,
      onClick: () => go("incomplete_coverage"),
      ariaLabel: "Ver operaciones con cobertura incompleta",
    },
    {
      key: "open",
      label: "Jornadas sin cierre",
      value: summary?.openAttendanceWorkdays ?? 0,
      description: formatDelta(summary?.comparison?.openAttendanceRate, true),
      onClick: () => go("open_attendance"),
      ariaLabel: "Ver jornadas sin cierre",
    },
    {
      key: "geofence",
      label: "Fuera de geocerca",
      value: summary?.outsideGeofenceCount ?? 0,
      description: formatDelta(summary?.comparison?.outsideGeofenceRate, true),
      onClick: () => go("outside_geofence"),
      ariaLabel: "Ver fuera de geocerca",
    },
    {
      key: "pending",
      label: "Pendiente de revisión",
      value: summary?.pendingReviewCount ?? 0,
      onClick: () => go("pending_review"),
      ariaLabel: "Ver pendientes de revisión",
    },
    {
      key: "late",
      label: "Llegadas tarde",
      value: summary?.lateWorkdays ?? 0,
      onClick: () => go("late_arrival"),
      ariaLabel: "Ver llegadas tarde",
    },
    {
      key: "early",
      label: "Salidas tempranas",
      value: summary?.earlyDepartureWorkdays ?? 0,
      onClick: () => go("early_departure"),
      ariaLabel: "Ver salidas tempranas",
    },
    {
      key: "hours",
      label: "Horas trabajadas",
      value: formatDurationFromMinutes(summary?.workedMinutes ?? 0),
      description: summary?.hoursDataIncomplete
        ? "Dato parcial: hay jornadas sin cierre"
        : formatDurationFromMinutes(summary?.overtimeMinutes ?? 0) !== "0m"
          ? `Extra: ${formatDurationFromMinutes(summary?.overtimeMinutes ?? 0)}`
          : undefined,
    },
  ];

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
      {items.map((item) => (
        <MetricCard
          key={item.key}
          title={item.label}
          loading={isLoading}
          value={item.value}
          description={item.description}
          onClick={item.onClick}
          aria-label={item.ariaLabel}
        />
      ))}
      {!isLoading && (summary?.scheduledWorkdays ?? 0) === 0 ? (
        <Text size="sm" c="dimmed">
          Sin jornadas en el período seleccionado.
        </Text>
      ) : null}
    </SimpleGrid>
  );
}
