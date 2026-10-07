import { Box, Group, SimpleGrid, Skeleton, Stack, Text, UnstyledButton } from "@mantine/core";
import { useNavigate } from "react-router";
import type { AttendanceStatisticsSummary } from "../../types/statistics";
import { formatPercent } from "../../utils/export";
import {
  buildAttendanceExceptionHref,
  type StatisticsDeepLinkContext,
  type StatisticsExceptionLinkKey,
} from "../../utils/statistics-deep-links";
import {
  buildHomeStatisticsConfirmationHref,
  buildHomeStatisticsEmployeeTabHref,
  countHomeAttendanceIrregularities,
} from "./home-dashboard";
import {
  homeKpiToneColor,
  resolvePrimaryKpiTone,
  resolveSecondaryKpiTone,
} from "./home-dashboard-kpi";
import classes from "./home-page.module.css";

interface HomeDashboardKpiCardsProps {
  summary?: AttendanceStatisticsSummary;
  unavailableWorkdays?: number;
  isLoading?: boolean;
  unavailableLoading?: boolean;
  linkContext: StatisticsDeepLinkContext;
}

type KpiItem = {
  key: string;
  label: string;
  value: string | number;
  numericValue: number;
  onClick?: () => void;
  loading?: boolean;
  toneResolver: (key: string, value: number) => ReturnType<typeof resolvePrimaryKpiTone>;
};

function CompactKpi({ item }: { item: KpiItem }) {
  if (item.loading) {
    return (
      <Box py={4}>
        <Skeleton height={10} width="70%" mb={6} />
        <Skeleton height={18} width="40%" />
      </Box>
    );
  }

  const tone = item.toneResolver(item.key, item.numericValue);
  const mutedZero = item.numericValue === 0 && typeof item.value === "number";
  const valueColor = mutedZero ? "dimmed" : homeKpiToneColor[tone];

  const body = (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" lineClamp={2} lh={1.35}>
        {item.label}
      </Text>
      <Text size="xl" fw={700} lh={1.15} c={valueColor} style={{ letterSpacing: "-0.02em" }}>
        {item.value}
      </Text>
    </Stack>
  );

  if (!item.onClick) {
    return <Box py={2}>{body}</Box>;
  }

  return (
    <UnstyledButton onClick={item.onClick} style={{ width: "100%" }} py={2}>
      {body}
    </UnstyledButton>
  );
}

function SecondaryKpi({ item }: { item: KpiItem }) {
  if (item.loading) {
    return <Skeleton height={28} width="80%" />;
  }

  const tone = item.toneResolver(item.key, item.numericValue);
  const muted = item.numericValue === 0 && typeof item.value === "number";
  const valueColor = muted ? "dimmed" : homeKpiToneColor[tone];

  const content = (
    <GroupInline label={item.label} value={item.value} valueColor={valueColor} muted={muted} />
  );

  if (!item.onClick) {
    return content;
  }

  return (
    <UnstyledButton onClick={item.onClick} style={{ width: "100%" }}>
      {content}
    </UnstyledButton>
  );
}

function GroupInline({
  label,
  value,
  valueColor,
  muted,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  muted?: boolean;
}) {
  return (
    <Group gap={4} wrap="nowrap" justify="space-between">
      <Text size="xs" c={muted ? "dimmed" : "dimmed"} truncate>
        {label}
      </Text>
      <Text size="xs" fw={muted ? 500 : 600} c={valueColor}>
        {value}
      </Text>
    </Group>
  );
}

export function HomeDashboardKpiCards({
  summary,
  unavailableWorkdays,
  isLoading,
  unavailableLoading,
  linkContext,
}: HomeDashboardKpiCardsProps) {
  const navigate = useNavigate();

  const goException = (key: StatisticsExceptionLinkKey) => {
    navigate(buildAttendanceExceptionHref(key, linkContext));
  };

  const presentismoDenom = (summary?.presentWorkdays ?? 0) + (summary?.absentWorkdays ?? 0);
  const punctualityDenom = (summary?.onTimeWorkdays ?? 0) + (summary?.lateWorkdays ?? 0);
  const irregularities = countHomeAttendanceIrregularities(summary);
  const unavailable = unavailableWorkdays ?? 0;

  const primary: KpiItem[] = [
    {
      key: "scheduled",
      label: "Jornadas programadas",
      value: summary?.scheduledWorkdays ?? 0,
      numericValue: summary?.scheduledWorkdays ?? 0,
      loading: isLoading,
      toneResolver: resolvePrimaryKpiTone,
    },
    {
      key: "present",
      label: "Presentes",
      value: summary?.presentWorkdays ?? 0,
      numericValue: summary?.presentWorkdays ?? 0,
      loading: isLoading,
      toneResolver: resolvePrimaryKpiTone,
    },
    {
      key: "expected",
      label: "Pendientes / esperadas",
      value: summary?.expectedOpenWorkdays ?? 0,
      numericValue: summary?.expectedOpenWorkdays ?? 0,
      loading: isLoading,
      toneResolver: resolvePrimaryKpiTone,
    },
    {
      key: "absent",
      label: "Ausencias no justificadas",
      value: summary?.absentWorkdays ?? 0,
      numericValue: summary?.absentWorkdays ?? 0,
      onClick: () => goException("unjustified_absence"),
      loading: isLoading,
      toneResolver: resolvePrimaryKpiTone,
    },
    {
      key: "unavailable",
      label: "Avisó que no asistiría",
      value: unavailable,
      numericValue: unavailable,
      onClick: () => navigate(buildHomeStatisticsConfirmationHref("UNAVAILABLE", linkContext)),
      loading: isLoading || unavailableLoading,
      toneResolver: resolvePrimaryKpiTone,
    },
    {
      key: "late",
      label: "Llegadas tarde",
      value: summary?.lateWorkdays ?? 0,
      numericValue: summary?.lateWorkdays ?? 0,
      onClick: () => goException("late_arrival"),
      loading: isLoading,
      toneResolver: resolvePrimaryKpiTone,
    },
  ];

  const secondary: KpiItem[] = [
    {
      key: "attendanceRate",
      label: "Presentismo",
      value: presentismoDenom > 0 ? formatPercent(summary?.attendanceRate ?? 0) : "—",
      numericValue: presentismoDenom > 0 ? summary?.attendanceRate ?? 0 : 0,
      loading: isLoading,
      toneResolver: resolveSecondaryKpiTone,
    },
    {
      key: "punctuality",
      label: "Puntualidad",
      value: punctualityDenom > 0 ? formatPercent(summary?.punctualityRate ?? 0) : "—",
      numericValue: punctualityDenom > 0 ? summary?.punctualityRate ?? 0 : 0,
      loading: isLoading,
      toneResolver: resolveSecondaryKpiTone,
    },
    {
      key: "irregularities",
      label: "Revisión / geocerca",
      value: irregularities,
      numericValue: irregularities,
      onClick: () => goException("pending_review"),
      loading: isLoading,
      toneResolver: resolveSecondaryKpiTone,
    },
    {
      key: "open",
      label: "Sin cierre",
      value: summary?.openAttendanceWorkdays ?? 0,
      numericValue: summary?.openAttendanceWorkdays ?? 0,
      onClick: () => goException("open_attendance"),
      loading: isLoading,
      toneResolver: resolveSecondaryKpiTone,
    },
    {
      key: "incompleteCoverage",
      label: "Cobertura incompleta",
      value: summary?.incompleteCoverageOperations ?? 0,
      numericValue: summary?.incompleteCoverageOperations ?? 0,
      onClick: () => goException("incomplete_coverage"),
      loading: isLoading,
      toneResolver: resolveSecondaryKpiTone,
    },
    {
      key: "justified",
      label: "Aus. justificadas",
      value: summary?.justifiedWorkdays ?? 0,
      numericValue: summary?.justifiedWorkdays ?? 0,
      onClick: () => navigate(buildHomeStatisticsEmployeeTabHref("JUSTIFIED", linkContext)),
      loading: isLoading,
      toneResolver: resolveSecondaryKpiTone,
    },
  ];

  return (
    <Stack gap="sm">
      <Text className={classes.kpiSectionLabel}>Cobertura del día</Text>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        {primary.map((item) => (
          <CompactKpi key={item.key} item={item} />
        ))}
      </SimpleGrid>
      <Box pt="sm" className={classes.kpiDivider}>
        <Text className={classes.kpiSectionLabel} mb="xs">
          Señales operativas
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
          {secondary.map((item) => (
            <SecondaryKpi key={item.key} item={item} />
          ))}
        </SimpleGrid>
      </Box>
    </Stack>
  );
}
