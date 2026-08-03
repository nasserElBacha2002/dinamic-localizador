import { Grid, Group, Stack, Text } from "@mantine/core";
import { useNavigate } from "react-router";
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
import {
  buildAttendanceExceptionHref,
  buildEmployeeAttendanceHref,
  buildOperationDetailHref,
  buildServiceAttendanceHref,
  type StatisticsExceptionLinkKey,
} from "../../../utils/statistics-deep-links";
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
  | "linkContext"
  | "timelineQuery"
  | "timeline"
  | "timelineOption"
  | "timelineExportRows"
  | "actionExceptions"
  | "actionExceptionsOption"
  | "lowCoverageOperationsQuery"
  | "lowCoverageOperations"
  | "attentionEmployeesQuery"
  | "attentionEmployees"
  | "topLateEmployeesQuery"
  | "topLateEmployees"
  | "incidentServicesQuery"
  | "incidentServices"
  | "workdayDetailHeaders"
  | "loadWorkdayDetailExportRows"
>;

function formatOperationChartLabel(
  row: StatisticsPageData["lowCoverageOperations"][number],
): string {
  if (row.displayLabel) {
    return row.displayLabel;
  }
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
  linkContext,
  timelineQuery,
  timeline,
  timelineOption,
  timelineExportRows,
  actionExceptions,
  actionExceptionsOption,
  lowCoverageOperationsQuery,
  lowCoverageOperations,
  attentionEmployeesQuery,
  attentionEmployees,
  topLateEmployeesQuery,
  topLateEmployees,
  incidentServicesQuery,
  incidentServices,
  workdayDetailHeaders,
  loadWorkdayDetailExportRows,
}: StatisticsGeneralTabProps) {
  const navigate = useNavigate();

  return (
    <Stack gap="lg">
      <Group justify="flex-end" gap="sm">
        <ExportActionButtons
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          disabled={exportsDisabled}
          targets={[
            {
              label: "Resumen",
              baseName: "attendance-summary",
              headers: summaryHeaders,
              rows: summaryExportRows,
              sheetName: "Resumen",
            },
            {
              label: "Detalle jornadas",
              baseName: "attendance-workday-details",
              headers: workdayDetailHeaders,
              loadRows: loadWorkdayDetailExportRows,
              sheetName: "Detalle jornadas",
            },
          ]}
        />
      </Group>

      {summaryQuery.isError ? (
        <ErrorState message={getApiErrorMessage(summaryQuery.error)} />
      ) : (
        <StatisticsKpiCards
          summary={summary}
          isLoading={summaryQuery.isPending}
          linkContext={linkContext}
        />
      )}

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <ChartCard
            title="Asistencia en el tiempo"
            description="Presentismo y puntualidad con volumen de jornadas. El día actual se marca como parcial."
            isLoading={timelineQuery.isPending}
            isEmpty={timeline.length === 0}
            emptyMessage="Sin jornadas en el período (o solo fechas futuras)."
            option={timelineOption}
            exportHeaders={[
              "Fecha",
              "Presentismo %",
              "Puntualidad %",
              "Jornadas",
              "Presentes",
              "Ausentes",
              "Puntuales",
              "Tarde",
              "Estado día",
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
            title="Excepciones que requieren atención"
            description="Categorías no excluyentes: una jornada puede aparecer en más de una."
            isLoading={summaryQuery.isPending}
            isEmpty={actionExceptions.length === 0}
            emptyMessage="Sin excepciones en el período."
            option={actionExceptionsOption}
            onChartClick={(params) => {
              const index = typeof params.dataIndex === "number" ? params.dataIndex : -1;
              const item = actionExceptions[index];
              const key = (item?.key ?? item?.status) as StatisticsExceptionLinkKey | undefined;
              if (!key) {
                return;
              }
              navigate(buildAttendanceExceptionHref(key, linkContext));
            }}
            exportHeaders={["Excepción", "Cantidad", "Tasa %", "Denominador"]}
            exportRows={actionExceptions.map((item) => [
              item.label,
              item.count,
              item.rate ?? "—",
              item.denominator ?? "",
            ])}
            exportBaseName="attendance-action-exceptions"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard
            title="Operaciones con menor cobertura"
            description="Presentes / (presentes + ausentes). Solo operaciones consolidadas con muestra suficiente."
            isLoading={lowCoverageOperationsQuery.isPending}
            isEmpty={lowCoverageOperations.length === 0}
            emptyMessage="Sin operaciones con cobertura incompleta y muestra suficiente."
            option={buildHorizontalBarOption(
              "",
              lowCoverageOperations.map((row) => formatOperationChartLabel(row)),
              lowCoverageOperations.map((row) => row.coverageRate ?? row.attendanceRate),
            )}
            onChartClick={(params) => {
              const index = typeof params.dataIndex === "number" ? params.dataIndex : -1;
              const row = lowCoverageOperations[index];
              if (row) {
                navigate(buildOperationDetailHref(row.operationId));
              }
            }}
            exportHeaders={[
              "Operación",
              "Servicio",
              "Presentes",
              "Esperados consolidados",
              "Cobertura",
              "Ausentes",
              "Estado",
            ]}
            exportRows={lowCoverageOperations.map((row) => [
              row.displayLabel ?? formatOperationChartLabel(row),
              row.serviceName,
              row.presentWorkdays,
              row.expectedStaffWorkdays ?? row.presentWorkdays + row.absentWorkdays,
              formatPercent(row.coverageRate ?? row.attendanceRate),
              row.absentWorkdays,
              row.operationalStatus,
            ])}
            exportBaseName="attendance-low-coverage-operations"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard
            title="Colaboradores que requieren atención"
            description="Ordenados por incidencias (elegibilidad aplicada en servidor)."
            isLoading={attentionEmployeesQuery.isPending}
            isEmpty={attentionEmployees.length === 0}
            emptyMessage="Sin colaboradores con incidencias en el período."
            option={buildHorizontalBarOption(
              "",
              attentionEmployees.map((row) => row.employeeName),
              attentionEmployees.map((row) => row.incidentCount ?? 0),
              "",
            )}
            onChartClick={(params) => {
              const index = typeof params.dataIndex === "number" ? params.dataIndex : -1;
              const row = attentionEmployees[index];
              if (row) {
                navigate(buildEmployeeAttendanceHref(row.employeeId, linkContext));
              }
            }}
            exportHeaders={[
              "Colaborador",
              "Incidencia principal",
              "Incidencias",
              "Jornadas",
              "Presentismo",
              "Muestra",
            ]}
            exportRows={attentionEmployees.map((row) => [
              row.employeeName,
              row.primaryIncidentLabel ?? "—",
              row.incidentCount ?? 0,
              row.scheduledWorkdays,
              row.sampleInsufficient
                ? "muestra insuficiente"
                : formatPercent(row.attendanceRate),
              `${row.presentWorkdays + row.absentWorkdays}`,
            ])}
            exportBaseName="attendance-attention-employees"
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
            onChartClick={(params) => {
              const index = typeof params.dataIndex === "number" ? params.dataIndex : -1;
              const row = topLateEmployees[index];
              if (row) {
                navigate(buildEmployeeAttendanceHref(row.employeeId, linkContext));
              }
            }}
            exportHeaders={["Empleado", "Llegadas tarde", "Jornadas"]}
            exportRows={topLateEmployees.map((row) => [
              row.employeeName,
              row.lateWorkdays,
              row.scheduledWorkdays,
            ])}
            exportBaseName="attendance-late-employees"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ChartCard
            title="Servicios con más incidencias"
            description="Cantidad de jornadas con incidencias (no un índice compuesto)."
            isLoading={incidentServicesQuery.isPending}
            isEmpty={incidentServices.length === 0}
            emptyMessage="Sin servicios con incidencias y muestra suficiente."
            option={buildVerticalBarOption(
              "",
              incidentServices.map((row) => row.serviceName),
              incidentServices.map((row) => row.incidentCount ?? 0),
            )}
            onChartClick={(params) => {
              const index = typeof params.dataIndex === "number" ? params.dataIndex : -1;
              const row = incidentServices[index];
              if (row) {
                navigate(buildServiceAttendanceHref(row.serviceId, linkContext));
              }
            }}
            exportHeaders={[
              "Servicio",
              "Dirección",
              "Jornadas",
              "Incidencias",
              "Tasa incidencias",
              "Cobertura",
            ]}
            exportRows={incidentServices.map((row) => [
              row.serviceName,
              row.address ?? "",
              row.scheduledWorkdays,
              row.incidentCount ?? 0,
              formatPercent(row.incidentRate ?? 0),
              formatPercent(row.coverageRate ?? row.attendanceRate),
            ])}
            exportBaseName="attendance-incident-services"
            dateFrom={isoDateFrom}
            dateTo={isoDateTo}
            exportsDisabled={exportsDisabled}
          />
        </Grid.Col>
      </Grid>

      {summaryQuery.isError ? (
        <Text size="sm" c="red">
          No se pudieron cargar las excepciones: {getApiErrorMessage(summaryQuery.error)}
        </Text>
      ) : null}
    </Stack>
  );
}
