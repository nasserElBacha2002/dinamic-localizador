import type {
  AttendanceStatisticsSummary,
  OperationalIncidentSummaryMetrics,
} from "../../types/statistics";
import type { StatisticsIncidentLinkKey } from "../../utils/statistics-deep-links";
import { HOME_ATTENDANCE_MANTINE_COLORS } from "./home-dashboard-chart-colors";

export type HomeAttendanceDistributionItem = {
  key: "present" | "expected" | "absent" | "justified";
  label: string;
  count: number;
  color: string;
};

export type HomeOperationalIncidentChartItem = {
  key: StatisticsIncidentLinkKey;
  label: string;
  count: number;
};

export type HomeAttendanceStackModel = {
  total: number;
  segments: HomeAttendanceDistributionItem[];
  legendLine: string;
};

export type HomeAttendanceBarChartRow = {
  category: string;
  present?: number;
  expected?: number;
  absent?: number;
  justified?: number;
};

export type HomeAttendanceBarChartSeries = {
  name: keyof Omit<HomeAttendanceBarChartRow, "category">;
  label: string;
  color: string;
};

export type HomeOperationalIncidentBarRow = {
  category: string;
  operations: number;
  key: StatisticsIncidentLinkKey;
};

export function buildHomeAttendanceDistribution(
  summary?: AttendanceStatisticsSummary,
): HomeAttendanceDistributionItem[] {
  if (!summary) {
    return [];
  }

  const items: HomeAttendanceDistributionItem[] = [
    {
      key: "present",
      label: "Presentes",
      count: summary.presentWorkdays ?? 0,
      color: HOME_ATTENDANCE_MANTINE_COLORS.present,
    },
    {
      key: "expected",
      label: "Pendientes / esperadas",
      count: summary.expectedOpenWorkdays ?? 0,
      color: HOME_ATTENDANCE_MANTINE_COLORS.expected,
    },
    {
      key: "absent",
      label: "Ausencias no justificadas",
      count: summary.absentWorkdays ?? 0,
      color: HOME_ATTENDANCE_MANTINE_COLORS.absent,
    },
    {
      key: "justified",
      label: "Ausencias justificadas",
      count: summary.justifiedWorkdays ?? 0,
      color: HOME_ATTENDANCE_MANTINE_COLORS.justified,
    },
  ];

  return items;
}

export function buildHomeAttendanceStackModel(
  summary?: AttendanceStatisticsSummary,
): HomeAttendanceStackModel | null {
  if (!summary || isHomeAttendanceDistributionEmpty(summary)) {
    return null;
  }

  const all = buildHomeAttendanceDistribution(summary);
  const segments = all.filter((item) => item.count > 0);
  const total = summary.scheduledWorkdays ?? 0;

  const legendLine = buildHomeAttendanceLegendLine(total, segments);

  return { total, segments, legendLine };
}

export function buildHomeAttendanceLegendLine(
  total: number,
  segments: HomeAttendanceDistributionItem[],
): string {
  if (total <= 0 || segments.length === 0) {
    return "";
  }

  return segments
    .map((segment) => {
      const pct = (segment.count / total) * 100;
      const pctLabel = Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
      return `${segment.label} ${segment.count} (${pctLabel})`;
    })
    .join(" · ");
}

export function buildHomeAttendanceBarChartRow(
  stack: HomeAttendanceStackModel,
): HomeAttendanceBarChartRow {
  const row: HomeAttendanceBarChartRow = { category: "Jornadas" };
  for (const segment of stack.segments) {
    row[segment.key] = segment.count;
  }
  return row;
}

export function buildHomeAttendanceBarChartSeries(
  stack: HomeAttendanceStackModel,
): HomeAttendanceBarChartSeries[] {
  return stack.segments.map((segment) => ({
    name: segment.key,
    label: segment.label,
    color: `${segment.color}.6`,
  }));
}

export function buildHomeOperationalIncidentBarData(
  items: HomeOperationalIncidentChartItem[],
): HomeOperationalIncidentBarRow[] {
  return items.map((item) => ({
    category: item.label,
    operations: item.count,
    key: item.key,
  }));
}

export function isHomeAttendanceDistributionEmpty(summary?: AttendanceStatisticsSummary): boolean {
  return (summary?.scheduledWorkdays ?? 0) === 0;
}

export function buildHomeOperationalIncidentChartItems(
  incidents?: OperationalIncidentSummaryMetrics | null,
): HomeOperationalIncidentChartItem[] {
  if (!incidents) {
    return [];
  }

  const items: HomeOperationalIncidentChartItem[] = [
    {
      key: "incomplete_punches",
      label: "Fichaje incompleto",
      count: incidents.operationsWithIncompletePunches ?? 0,
    },
    {
      key: "not_confirmed",
      label: "Sin confirmar",
      count: incidents.operationsWithUnconfirmedAssignments ?? 0,
    },
    {
      key: "coverage_required",
      label: "Cobertura / reemplazo",
      count: incidents.operationsWithCoverage ?? 0,
    },
    {
      key: "operation_modified",
      label: "Modificadas",
      count: incidents.modifiedOperations ?? 0,
    },
  ];

  return items.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
}

