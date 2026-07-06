import { Grid, Group, Stack } from "@mantine/core";
import { ErrorState } from "../../../design-system";
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
  | "operationExportQuery"
  | "topOperationsByAttendance"
  | "employeeExportQuery"
  | "topEmployeesByAttendance"
  | "topLateEmployees"
  | "serviceExportQuery"
  | "topServicesByAttendance"
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
  operationExportQuery,
  topOperationsByAttendance,
  employeeExportQuery,
  topEmployeesByAttendance,
  topLateEmployees,
  serviceExportQuery,
  topServicesByAttendance,
}: StatisticsGeneralTabProps) {
  return (
    <Stack gap="lg">
      <Group justify="flex-end">
        <ExportActionButtons
          baseName="attendance-summary"
          headers={summaryHeaders}
          rows={summaryExportRows}
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          sheetName="Resumen"
          disabled={exportsDisabled}
        />
      </Group>

      {summaryQuery.isError ? (
        <ErrorState message={getApiErrorMessage(summaryQuery.error)} />
      ) : (
        <StatisticsKpiCards summary={summary} isLoading={summaryQuery.isPending} />
      )}

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
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
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
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
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard
            title="% asistencia por operación (top 10)"
            isLoading={operationExportQuery.isPending}
            isEmpty={topOperationsByAttendance.length === 0}
            option={buildHorizontalBarOption(
              "",
              topOperationsByAttendance.map(
                (row) => `${row.serviceName} (${row.scheduledStart.slice(0, 10)})`,
              ),
              topOperationsByAttendance.map((row) => row.attendancePercentage),
            )}
            exportHeaders={["Operación", "Servicio", "Fecha", "% asistencia"]}
            exportRows={topOperationsByAttendance.map((row) => [
              row.operationId,
              row.serviceName,
              row.scheduledStart.slice(0, 10),
              formatPercent(row.attendancePercentage),
            ])}
            exportBaseName="attendance-by-operation-chart"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
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
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
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
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard
            title="Rendimiento por servicio"
            isLoading={serviceExportQuery.isPending}
            isEmpty={topServicesByAttendance.length === 0}
            option={buildVerticalBarOption(
              "",
              topServicesByAttendance.map((row) => row.serviceName),
              topServicesByAttendance.map((row) => row.averageAttendancePercentage),
              "%",
            )}
            exportHeaders={["Servicio", "% asistencia promedio"]}
            exportRows={topServicesByAttendance.map((row) => [
              row.serviceName,
              formatPercent(row.averageAttendancePercentage),
            ])}
            exportBaseName="attendance-by-service-chart"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
