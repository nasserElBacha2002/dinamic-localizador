import { SimpleGrid } from "@mantine/core";
import { MetricCard } from "../../design-system";
import { assignedWorkersLabel, terminology } from "../../domain/terminology";
import type { AttendanceStatisticsSummary } from "../../types/statistics";
import { formatPercent } from "../../utils/export";

interface StatisticsKpiCardsProps {
  summary?: AttendanceStatisticsSummary;
  isLoading?: boolean;
}

const KPI_ITEMS: Array<{
  key: keyof AttendanceStatisticsSummary;
  label: string;
  format?: (value: number) => string;
}> = [
  { key: "totalAttendanceRecords", label: "Registros de asistencia" },
  { key: "totalAssignedEmployees", label: assignedWorkersLabel },
  { key: "attendancePercentage", label: "% asistencia", format: formatPercent },
  { key: "presentCount", label: "Presente / a tiempo" },
  { key: "lateCount", label: "Tarde" },
  { key: "outsideGeofenceCount", label: "Fuera de geocerca" },
  { key: "pendingReviewCount", label: "Pendiente de revisión" },
  { key: "rejectedCount", label: "Rechazados" },
  { key: "manuallyAcceptedCount", label: "Aceptados manualmente" },
  { key: "noShowCount", label: "Sin asistencia" },
  { key: "totalOperations", label: terminology.operation.plural },
];

export function StatisticsKpiCards({ summary, isLoading }: StatisticsKpiCardsProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
      {KPI_ITEMS.map((item) => (
        <MetricCard
          key={item.key}
          title={item.label}
          loading={isLoading}
          value={
            item.format
              ? item.format(summary?.[item.key] ?? 0)
              : (summary?.[item.key] ?? 0)
          }
        />
      ))}
    </SimpleGrid>
  );
}
