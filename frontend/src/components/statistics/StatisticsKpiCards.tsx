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

function kpiValueColor(key: string, numericValue: number): string | undefined {
  if (numericValue === 0 && key !== "attendanceRate" && key !== "punctualityRate" && key !== "coverageRate") {
    return "dimmed";
  }
  switch (key) {
    case "absent":
    case "geofence":
      return numericValue > 0 ? "danger.7" : undefined;
    case "late":
    case "early":
    case "open":
    case "pending":
    case "incompleteCoverage":
      return numericValue > 0 ? "warning.7" : undefined;
    case "present":
      return numericValue > 0 ? "success.7" : undefined;
    default:
      return undefined;
  }
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
    numericValue: number;
    description?: string;
    onClick?: () => void;
    ariaLabel?: string;
  }> = [
    {
      key: "scheduled",
      label: "Jornadas programadas",
      numericValue: summary?.scheduledWorkdays ?? 0,
      value: summary?.scheduledWorkdays ?? 0,
      description: `Requeridas: ${summary?.attendanceRequiredWorkdays ?? 0} · Canceladas: ${summary?.cancelledWorkdays ?? 0}`,
    },
    {
      key: "present",
      label: "Presentes",
      numericValue: summary?.presentWorkdays ?? 0,
      value: summary?.presentWorkdays ?? 0,
    },
    {
      key: "absent",
      label: "Ausencias no justificadas",
      numericValue: summary?.absentWorkdays ?? 0,
      value: summary?.absentWorkdays ?? 0,
      description: formatDelta(summary?.comparison?.absenceRate, true),
      onClick: () => go("unjustified_absence"),
      ariaLabel: "Ver ausencias no justificadas",
    },
    {
      key: "justified",
      label: "Justificadas",
      numericValue: summary?.justifiedWorkdays ?? 0,
      value: summary?.justifiedWorkdays ?? 0,
    },
    {
      key: "expected",
      label: "Pendientes / esperadas",
      numericValue: summary?.expectedOpenWorkdays ?? 0,
      value: summary?.expectedOpenWorkdays ?? 0,
      description: "No cuentan como ausencias ni en presentismo",
    },
    {
      key: "attendanceRate",
      label: "Presentismo (cobertura)",
      numericValue: presentismoDenom > 0 ? summary?.attendanceRate ?? 0 : 0,
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
      numericValue: punctualityDenom > 0 ? summary?.punctualityRate ?? 0 : 0,
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
      numericValue: presentismoDenom > 0 ? summary?.coverageRate ?? 0 : 0,
      value: formatRateWithVolume(
        summary?.coverageRate ?? 0,
        summary?.presentWorkdays ?? 0,
        presentismoDenom,
      ),
    },
    {
      key: "incompleteCoverage",
      label: "Cobertura de plantilla incompleta",
      numericValue: summary?.incompleteCoverageOperations ?? 0,
      value: summary?.incompleteCoverageOperations ?? 0,
      onClick: () => go("incomplete_coverage"),
      ariaLabel: "Ver operaciones con cobertura de plantilla incompleta",
      description: "Presentismo consolidado (no es cobertura por reemplazo)",
    },
    {
      key: "open",
      label: "Jornadas sin cierre",
      numericValue: summary?.openAttendanceWorkdays ?? 0,
      value: summary?.openAttendanceWorkdays ?? 0,
      description: formatDelta(summary?.comparison?.openAttendanceRate, true),
      onClick: () => go("open_attendance"),
      ariaLabel: "Ver jornadas sin cierre",
    },
    {
      key: "geofence",
      label: "Fuera de geocerca",
      numericValue: summary?.outsideGeofenceCount ?? 0,
      value: summary?.outsideGeofenceCount ?? 0,
      description: formatDelta(summary?.comparison?.outsideGeofenceRate, true),
      onClick: () => go("outside_geofence"),
      ariaLabel: "Ver fuera de geocerca",
    },
    {
      key: "pending",
      label: "Pendiente de revisión",
      numericValue: summary?.pendingReviewCount ?? 0,
      value: summary?.pendingReviewCount ?? 0,
      onClick: () => go("pending_review"),
      ariaLabel: "Ver pendientes de revisión",
    },
    {
      key: "late",
      label: "Llegadas tarde",
      numericValue: summary?.lateWorkdays ?? 0,
      value: summary?.lateWorkdays ?? 0,
      onClick: () => go("late_arrival"),
      ariaLabel: "Ver llegadas tarde",
    },
    {
      key: "early",
      label: "Salidas tempranas",
      numericValue: summary?.earlyDepartureWorkdays ?? 0,
      value: summary?.earlyDepartureWorkdays ?? 0,
      onClick: () => go("early_departure"),
      ariaLabel: "Ver salidas tempranas",
    },
    {
      key: "hours",
      label: "Horas trabajadas",
      numericValue: summary?.workedMinutes ?? 0,
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
          valueColor={kpiValueColor(item.key, item.numericValue)}
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
