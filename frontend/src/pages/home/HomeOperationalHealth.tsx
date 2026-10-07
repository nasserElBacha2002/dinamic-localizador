import { Stack, Text } from "@mantine/core";
import { BarChart } from "@mantine/charts";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { LoadingState } from "../../design-system";
import type { AttendanceStatisticsSummary } from "../../types/statistics";
import type { StatisticsIncidentLinkKey } from "../../utils/statistics-deep-links";
import {
  buildOperationalIncidentHref,
  type StatisticsDeepLinkContext,
} from "../../utils/statistics-deep-links";
import { HOME_INCIDENT_BAR_COLOR } from "./home-dashboard-chart-colors";
import {
  buildHomeAttendanceBarChartRow,
  buildHomeAttendanceBarChartSeries,
  buildHomeAttendanceStackModel,
  buildHomeOperationalIncidentBarData,
  buildHomeOperationalIncidentChartItems,
  isHomeAttendanceDistributionEmpty,
} from "./home-dashboard-charts";

interface HomeOperationalHealthProps {
  summary?: AttendanceStatisticsSummary;
  isLoading?: boolean;
  linkContext: StatisticsDeepLinkContext;
}

const ATTENDANCE_CHART_HEIGHT = 40;
const INCIDENT_ROW_HEIGHT = 32;

export function HomeOperationalHealth({
  summary,
  isLoading,
  linkContext,
}: HomeOperationalHealthProps) {
  const navigate = useNavigate();

  const stack = useMemo(() => buildHomeAttendanceStackModel(summary), [summary]);
  const attendanceChartData = useMemo(
    () => (stack ? [buildHomeAttendanceBarChartRow(stack)] : []),
    [stack],
  );
  const attendanceSeries = useMemo(
    () => (stack ? buildHomeAttendanceBarChartSeries(stack) : []),
    [stack],
  );

  const incidentItems = useMemo(
    () => buildHomeOperationalIncidentChartItems(summary?.operationalIncidents),
    [summary?.operationalIncidents],
  );
  const incidentChartData = useMemo(
    () => buildHomeOperationalIncidentBarData(incidentItems),
    [incidentItems],
  );

  const incidentChartHeight = Math.max(
    incidentChartData.length * INCIDENT_ROW_HEIGHT + 16,
    INCIDENT_ROW_HEIGHT + 16,
  );

  if (isLoading) {
    return <LoadingState height={120} />;
  }

  const attendanceEmpty = isHomeAttendanceDistributionEmpty(summary);

  const handleIncidentBarClick = (row: { key: StatisticsIncidentLinkKey }) => {
    navigate(buildOperationalIncidentHref(row.key, linkContext));
  };

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
      <Stack gap={6}>
        <Text size="xs" fw={600} c="brand.7">
          Cobertura de jornadas
        </Text>
        {attendanceEmpty || !stack ? (
          <Text size="xs" c="dimmed">
            Sin jornadas programadas para hoy.
          </Text>
        ) : (
          <>
            <BarChart
              h={ATTENDANCE_CHART_HEIGHT}
              data={attendanceChartData}
              dataKey="category"
              type="stacked"
              orientation="horizontal"
              series={attendanceSeries}
              withLegend={false}
              withTooltip
              withXAxis={false}
              withYAxis={false}
              gridAxis="none"
              tooltipAnimationDuration={0}
            />
            <Text size="xs" c="dimmed">
              {stack.total} jornada{stack.total === 1 ? "" : "s"}
            </Text>
            <Text size="xs">{stack.legendLine}</Text>
          </>
        )}
      </Stack>

      <Stack gap={6} style={{ flex: 1, minHeight: 0 }}>
        <Text size="xs" fw={600} c="brand.7">
          Incidencias en operaciones
        </Text>
        {incidentChartData.length === 0 ? (
          <Text size="xs" c="dimmed">
            Sin incidencias operativas
          </Text>
        ) : (
          <BarChart
            h={incidentChartHeight}
            data={incidentChartData}
            dataKey="category"
            orientation="horizontal"
            series={[
              { name: "operations", label: "Operaciones", color: `${HOME_INCIDENT_BAR_COLOR}.6` },
            ]}
            withLegend={false}
            withTooltip
            gridAxis="y"
            tickLine="y"
            withXAxis={false}
            tooltipAnimationDuration={0}
            valueFormatter={(value) => `${value}`}
            barChartProps={{
              onClick: (state) => {
                const index = state.activeIndex;
                if (typeof index === "number" && incidentChartData[index]) {
                  handleIncidentBarClick(incidentChartData[index]);
                }
              },
            }}
          />
        )}
      </Stack>
    </Stack>
  );
}
