import { Card, CardContent, Grid, Skeleton, Typography } from "@mui/material";
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
  { key: "totalInventories", label: terminology.operation.plural },
];

export function StatisticsKpiCards({ summary, isLoading }: StatisticsKpiCardsProps) {
  return (
    <Grid container spacing={2}>
      {KPI_ITEMS.map((item) => (
        <Grid key={item.key} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {item.label}
              </Typography>
              {isLoading ? (
                <Skeleton width={80} height={36} />
              ) : (
                <Typography variant="h5" component="p">
                  {item.format ? item.format(summary?.[item.key] ?? 0) : (summary?.[item.key] ?? 0)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
