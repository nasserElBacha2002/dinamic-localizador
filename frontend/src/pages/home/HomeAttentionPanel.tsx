import { Anchor, Button, Group, Stack, Text } from "@mantine/core";
import { Link } from "react-router";
import { ErrorState, LoadingState, StatusBadge } from "../../design-system";
import { buildHomeStatisticsConfirmationHref, buildHomeStatisticsPageHref } from "./home-dashboard";
import type { HomeAttentionPanelState } from "./home-dashboard-attention-state";
import type { HomeAttentionViewModel } from "./home-dashboard-attention";
import { severityLabel, severityTone } from "./home-dashboard-attention";
import {
  flattenHomeAttentionRows,
  HOME_ATTENTION_SCROLL_THRESHOLD,
} from "./home-dashboard-attention-presentation";
import type { StatisticsDeepLinkContext } from "../../utils/statistics-deep-links";
import type { DateRangeValue } from "../../types/date-range";

interface HomeAttentionPanelProps {
  panelState: HomeAttentionPanelState;
  linkContext: StatisticsDeepLinkContext;
  dateRange?: DateRangeValue;
}

function AttentionActionRow({
  severity,
  title,
  subtitle,
  href,
}: {
  severity: HomeAttentionViewModel["globalIssues"][number]["severity"];
  title: string;
  subtitle?: string;
  href: string;
}) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm" py={4}>
      <Group align="flex-start" wrap="nowrap" gap="sm" style={{ minWidth: 0, flex: 1 }}>
        <StatusBadge
          label={severityLabel[severity]}
          tone={severityTone[severity]}
          variant="light"
        />
        <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={600} lineClamp={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text size="xs" c="dimmed" truncate>
              {subtitle}
            </Text>
          ) : null}
        </Stack>
      </Group>
      <Button component={Link} to={href} variant="subtle" size="compact-xs">
        Ver
      </Button>
    </Group>
  );
}

export function HomeAttentionPanel({ panelState, linkContext, dateRange }: HomeAttentionPanelProps) {
  const statisticsHref = dateRange ? buildHomeStatisticsPageHref(dateRange) : "/statistics";
  const unavailableHref = buildHomeStatisticsConfirmationHref("UNAVAILABLE", linkContext);

  if (panelState.status === "loading") {
    return <LoadingState height={72} />;
  }

  if (panelState.status === "error") {
    return <ErrorState message={panelState.message} />;
  }

  if (panelState.status === "empty") {
    return (
      <Group gap="xs">
        <StatusBadge label="Al día" tone="success" />
        <Text size="sm" c="dimmed">
          Sin situaciones pendientes.
        </Text>
      </Group>
    );
  }

  const model = panelState.model;
  const rows = flattenHomeAttentionRows(model);
  const useScroll = rows.length > HOME_ATTENTION_SCROLL_THRESHOLD;

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      {panelState.status === "partial" ? (
        <ErrorState message={panelState.warnings.join(" · ")} />
      ) : null}
      <Stack
        gap={0}
        style={{
          flex: 1,
          minHeight: 0,
          ...(useScroll ? { maxHeight: 320, overflowY: "auto" } : undefined),
        }}
      >
        {rows.map((row) => {
          const href = row.id === "unavailable" ? unavailableHref : row.href;
          return (
            <AttentionActionRow
              key={row.id}
              severity={row.severity}
              title={row.title}
              subtitle={row.subtitle}
              href={href}
            />
          );
        })}
      </Stack>
      {model.truncatedIncidentDetails || model.truncatedEmployees || model.truncatedGlobalIssues ? (
        <Anchor component={Link} to={statisticsHref} size="xs">
          Ver todas en estadísticas
        </Anchor>
      ) : null}
    </Stack>
  );
}
