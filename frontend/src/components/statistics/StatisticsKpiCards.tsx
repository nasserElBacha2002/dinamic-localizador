import { SimpleGrid } from "@mantine/core";
import { MetricCard } from "../../design-system";
import { terminology } from "../../domain/terminology";
import type { AttendanceStatisticsSummary } from "../../types/statistics";
import { formatDurationFromMinutes } from "../../utils/duration";
import { formatPercent } from "../../utils/export";

interface StatisticsKpiCardsProps {
  summary?: AttendanceStatisticsSummary;
  isLoading?: boolean;
}

const KPI_ITEMS: Array<{
  key: keyof AttendanceStatisticsSummary | "workedHours" | "overtimeHours";
  label: string;
  format?: (value: number, summary?: AttendanceStatisticsSummary) => string;
  resolve?: (summary?: AttendanceStatisticsSummary) => number;
}> = [
  { key: "scheduledWorkdays", label: "Jornadas programadas" },
  { key: "presentWorkdays", label: "Presentes" },
  { key: "absentWorkdays", label: "Ausentes" },
  { key: "justifiedWorkdays", label: "Justificadas" },
  { key: "expectedOpenWorkdays", label: "Pendientes / esperadas" },
  { key: "attendanceRate", label: "Presentismo", format: (value) => formatPercent(value) },
  { key: "absenceRate", label: "Ausentismo", format: (value) => formatPercent(value) },
  {
    key: "punctualityRate",
    label: "Puntualidad",
    format: (value) => formatPercent(value),
  },
  { key: "onTimeWorkdays", label: "Llegadas puntuales" },
  { key: "lateWorkdays", label: "Llegadas tarde" },
  { key: "earlyDepartureWorkdays", label: "Salidas tempranas" },
  {
    key: "workedHours",
    label: "Horas trabajadas",
    resolve: (summary) => summary?.workedMinutes ?? 0,
    format: (value) => formatDurationFromMinutes(value),
  },
  {
    key: "overtimeHours",
    label: "Horas extra",
    resolve: (summary) => summary?.overtimeMinutes ?? 0,
    format: (value) => formatDurationFromMinutes(value),
  },
  { key: "openAttendanceWorkdays", label: "Asistencias sin cierre" },
  { key: "outsideGeofenceCount", label: "Fuera de geocerca" },
  { key: "pendingReviewCount", label: "Pendiente de revisión" },
  { key: "totalOperations", label: terminology.operation.plural },
];

export function StatisticsKpiCards({ summary, isLoading }: StatisticsKpiCardsProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
      {KPI_ITEMS.map((item) => {
        const rawValue = item.resolve ? item.resolve(summary) : (summary?.[item.key as keyof AttendanceStatisticsSummary] ?? 0);
        const numericValue = typeof rawValue === "number" ? rawValue : 0;

        return (
          <MetricCard
            key={item.key}
            title={item.label}
            loading={isLoading}
            value={item.format ? item.format(numericValue, summary) : numericValue}
          />
        );
      })}
    </SimpleGrid>
  );
}
