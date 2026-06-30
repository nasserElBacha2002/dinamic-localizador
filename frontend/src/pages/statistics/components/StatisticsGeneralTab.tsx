import { Grid, Stack } from "@mui/material";
import { ErrorState } from "../../../components/common/ErrorState";
import { ChartCard } from "../../../components/statistics/ChartCard";
import { ExportActionButtons } from "../../../components/statistics/ExportActionButtons";
import { StatisticsKpiCards } from "../../../components/statistics/StatisticsKpiCards";
import { buildHorizontalBarOption, buildVerticalBarOption } from "../../../components/statistics/statistics-chart-options";
import { formatPercent } from "../../../utils/export";
import { getApiErrorMessage } from "../../../utils/errors";
import type { StatisticsPageData } from "../hooks/useStatisticsPageData";

type StatisticsGeneralTabProps = Pick<
  StatisticsPageData,
  | "summaryHeaders"
  | "summaryExportRows"
  | "summaryQuery"
  | "summary"
  | "exportsDisabled"
  | "isoDateFrom"
  | "isoDateTo"
  | "timelineQuery"
  | "timeline"
  | "timelineOption"
  | "timelineExportRows"
  | "distributionQuery"
  | "distribution"
  | "distributionOption"
  | "inventoryExportQuery"
  | "topInventoriesByAttendance"
  | "employeeExportQuery"
  | "topEmployeesByAttendance"
  | "topLateEmployees"
  | "locationExportQuery"
  | "topLocationsByAttendance"
>;

export function StatisticsGeneralTab({
  summaryHeaders,
  summaryExportRows,
  summaryQuery,
  summary,
  exportsDisabled,
  isoDateFrom,
  isoDateTo,
  timelineQuery,
  timeline,
  timelineOption,
  timelineExportRows,
  distributionQuery,
  distribution,
  distributionOption,
  inventoryExportQuery,
  topInventoriesByAttendance,
  employeeExportQuery,
  topEmployeesByAttendance,
  topLateEmployees,
  locationExportQuery,
  topLocationsByAttendance,
}: StatisticsGeneralTabProps) {
  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="flex-end">
        <ExportActionButtons
          baseName="attendance-summary"
          headers={summaryHeaders}
          rows={summaryExportRows}
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          sheetName="Resumen"
          disabled={exportsDisabled}
        />
      </Stack>

      {summaryQuery.isError ? (
        <ErrorState message={getApiErrorMessage(summaryQuery.error)} />
      ) : (
        <StatisticsKpiCards summary={summary} isLoading={summaryQuery.isPending} />
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ChartCard
            title="Asistencia en el tiempo"
            isLoading={timelineQuery.isPending}
            isEmpty={timeline.length === 0}
            option={timelineOption}
            exportHeaders={[
              "Fecha",
              "Presente",
              "Tarde",
              "Fuera geocerca",
              "Pendiente",
              "Rechazado",
              "Sin asistencia",
              "Total",
            ]}
            exportRows={timelineExportRows}
            exportBaseName="attendance-timeline"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <ChartCard
            title="Distribución por estado"
            isLoading={distributionQuery.isPending}
            isEmpty={distribution.length === 0}
            option={distributionOption}
            exportHeaders={["Estado", "Cantidad"]}
            exportRows={distribution.map((item) => [item.label, item.count])}
            exportBaseName="attendance-status-distribution"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="% asistencia por inventario (top 10)"
            isLoading={inventoryExportQuery.isPending}
            isEmpty={topInventoriesByAttendance.length === 0}
            option={buildHorizontalBarOption(
              "",
              topInventoriesByAttendance.map(
                (row) => `${row.storeName} (${row.scheduledStart.slice(0, 10)})`,
              ),
              topInventoriesByAttendance.map((row) => row.attendancePercentage),
            )}
            exportHeaders={["Inventario", "Tienda", "Fecha", "% asistencia"]}
            exportRows={topInventoriesByAttendance.map((row) => [
              row.inventoryId,
              row.storeName,
              row.scheduledStart.slice(0, 10),
              formatPercent(row.attendancePercentage),
            ])}
            exportBaseName="attendance-by-inventory-chart"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="Top empleados por % asistencia"
            isLoading={employeeExportQuery.isPending}
            isEmpty={topEmployeesByAttendance.length === 0}
            option={buildHorizontalBarOption(
              "",
              topEmployeesByAttendance.map((row) => row.employeeName),
              topEmployeesByAttendance.map((row) => row.attendancePercentage),
            )}
            exportHeaders={["Empleado", "% asistencia"]}
            exportRows={topEmployeesByAttendance.map((row) => [
              row.employeeName,
              formatPercent(row.attendancePercentage),
            ])}
            exportBaseName="attendance-top-employees"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="Empleados con más registros tarde"
            isLoading={employeeExportQuery.isPending}
            isEmpty={topLateEmployees.length === 0}
            option={buildVerticalBarOption(
              "",
              topLateEmployees.map((row) => row.employeeName),
              topLateEmployees.map((row) => row.lateCount),
            )}
            exportHeaders={["Empleado", "Registros tarde"]}
            exportRows={topLateEmployees.map((row) => [row.employeeName, row.lateCount])}
            exportBaseName="attendance-late-employees"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="Rendimiento por tienda / ubicación"
            isLoading={locationExportQuery.isPending}
            isEmpty={topLocationsByAttendance.length === 0}
            option={buildVerticalBarOption(
              "",
              topLocationsByAttendance.map((row) => row.storeName),
              topLocationsByAttendance.map((row) => row.averageAttendancePercentage),
              "%",
            )}
            exportHeaders={["Tienda", "% asistencia promedio"]}
            exportRows={topLocationsByAttendance.map((row) => [
              row.storeName,
              formatPercent(row.averageAttendancePercentage),
            ])}
            exportBaseName="attendance-by-location-chart"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid>
      </Grid>
    </Stack>
  );
}
