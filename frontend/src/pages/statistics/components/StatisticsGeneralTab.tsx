import { Grid, Group, Stack } from "@mantine/core";
import { ErrorState } from "../../../design-system";
import { ChartCard } from "../../../components/statistics/ChartCard";
import { ExportActionButtons } from "../../../components/statistics/ExportActionButtons";
import { StatisticsKpiCards } from "../../../components/statistics/StatisticsKpiCards";
import {
  buildHorizontalBarOption,
  buildVerticalBarOption,
} from "../../../components/statistics/statistics-chart-options";
import { formatPercent } from "../../../utils/export";
import { getApiErrorMessage } from "../../../utils/errors";
import { operationKindLabels } from "../../../utils/operation-schedule-display";
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
  | "topOperationsByAttendanceQuery"
  | "topOperationsByAttendance"
  | "topEmployeesByAttendanceQuery"
  | "topEmployeesByAttendance"
  | "topLateEmployeesQuery"
  | "topLateEmployees"
  | "topServicesByAttendanceQuery"
  | "topServicesByAttendance"
  | "workdayDetailHeaders"
  | "loadWorkdayDetailExportRows"
>;

function formatOperationChartLabel(
  row: StatisticsPageData["topOperationsByAttendance"][number],
): string {
  const kind =
    operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ?? row.operationKind;
  return `${row.serviceName} (${kind})`;
}

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
  topOperationsByAttendanceQuery,
  topOperationsByAttendance,
  topEmployeesByAttendanceQuery,
  topEmployeesByAttendance,
  topLateEmployeesQuery,
  topLateEmployees,
  topServicesByAttendanceQuery,
  topServicesByAttendance,
  workdayDetailHeaders,
  loadWorkdayDetailExportRows,
}: StatisticsGeneralTabProps) {
  return (
    <Stack gap="lg">
      <Group justify="flex-end" gap="sm">
        <ExportActionButtons
          baseName="attendance-summary"
          headers={summaryHeaders}
          rows={summaryExportRows}
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          sheetName="Resumen"
          disabled={exportsDisabled}
        />
        <ExportActionButtons
          baseName="attendance-workday-details"
          headers={workdayDetailHeaders}
          loadRows={loadWorkdayDetailExportRows}
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          sheetName="Detalle jornadas"
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
              "Presentes",
              "Ausentes",
              "Justificadas",
              "Pendientes",
              "Programadas",
              "Puntuales",
              "Tarde",
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
            title="Presentismo por operación (top 10)"
            isLoading={topOperationsByAttendanceQuery.isPending}
            isEmpty={topOperationsByAttendance.length === 0}
            option={buildHorizontalBarOption(
              "",
              topOperationsByAttendance.map((row) => formatOperationChartLabel(row)),
              topOperationsByAttendance.map((row) => row.attendanceRate),
            )}
            exportHeaders={["Operación", "Servicio", "Tipo", "Presentismo"]}
            exportRows={topOperationsByAttendance.map((row) => [
              row.operationId,
              row.serviceName,
              operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ?? row.operationKind,
              formatPercent(row.attendanceRate),
            ])}
            exportBaseName="attendance-by-operation-chart"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard
            title="Top empleados por presentismo"
            isLoading={topEmployeesByAttendanceQuery.isPending}
            isEmpty={topEmployeesByAttendance.length === 0}
            option={buildHorizontalBarOption(
              "",
              topEmployeesByAttendance.map((row) => row.employeeName),
              topEmployeesByAttendance.map((row) => row.attendanceRate),
            )}
            exportHeaders={["Empleado", "Presentismo"]}
            exportRows={topEmployeesByAttendance.map((row) => [
              row.employeeName,
              formatPercent(row.attendanceRate),
            ])}
            exportBaseName="attendance-top-employees"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard
            title="Empleados con más llegadas tarde"
            isLoading={topLateEmployeesQuery.isPending}
            isEmpty={topLateEmployees.length === 0}
            option={buildVerticalBarOption(
              "",
              topLateEmployees.map((row) => row.employeeName),
              topLateEmployees.map((row) => row.lateWorkdays),
            )}
            exportHeaders={["Empleado", "Llegadas tarde"]}
            exportRows={topLateEmployees.map((row) => [row.employeeName, row.lateWorkdays])}
            exportBaseName="attendance-late-employees"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard
            title="Rendimiento por servicio"
            isLoading={topServicesByAttendanceQuery.isPending}
            isEmpty={topServicesByAttendance.length === 0}
            option={buildVerticalBarOption(
              "",
              topServicesByAttendance.map((row) => row.serviceName),
              topServicesByAttendance.map((row) => row.attendanceRate),
              "%",
            )}
            exportHeaders={["Servicio", "Presentismo"]}
            exportRows={topServicesByAttendance.map((row) => [
              row.serviceName,
              formatPercent(row.attendanceRate),
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
