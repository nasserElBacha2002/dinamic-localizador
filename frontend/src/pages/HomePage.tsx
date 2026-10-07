import { Anchor, Box, Button, Grid, Group, Stack, Text } from "@mantine/core";
import type { KeyboardEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { EntityLink } from "../components/entity-link";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../design-system";
import { terminology } from "../domain/terminology";
import type { OperationWithService } from "../types/operation";
import { formatDateTime } from "../utils/dates";
import { getApiErrorMessage } from "../utils/errors";
import { operationStatusLabels } from "../utils/labels";
import { buildOperationDetailHref } from "../utils/statistics-deep-links";
import { HomeAttentionPanel } from "./home/HomeAttentionPanel";
import { buildHomeAttentionSummary } from "./home/home-dashboard-attention-presentation";
import { HomeDashboardKpiCards } from "./home/HomeDashboardKpiCards";
import { HomeOperationalHealth } from "./home/HomeOperationalHealth";
import { useHomeDashboard } from "./home/useHomeDashboard";
import classes from "./home/home-page.module.css";

const HOME_COL_MAIN = { base: 12, lg: 7 } as const;
const HOME_COL_SIDE = { base: 12, lg: 5 } as const;

function DashboardTile({ children }: { children: ReactNode }) {
  return (
    <Box
      h="100%"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: 1,
      }}
    >
      {children}
    </Box>
  );
}

const homeGridColStyle = {
  display: "flex",
  flexDirection: "column" as const,
  minHeight: 0,
};

function TodayOperationsHeader() {
  return (
    <Group gap="xs" wrap="nowrap" visibleFrom="md" mb={4}>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ flex: 2.2, minWidth: 0, letterSpacing: "0.02em" }}>
        Servicio / operación
      </Text>
      <Text size="xs" c="dimmed" fw={600} style={{ flex: 2, minWidth: 0 }}>
        Ubicación
      </Text>
      <Text size="xs" c="dimmed" fw={600} style={{ flex: 1.6, minWidth: 0 }}>
        Horario
      </Text>
      <Text size="xs" c="dimmed" fw={600} style={{ flex: 1.2, minWidth: 0 }} ta="right">
        Estado
      </Text>
    </Group>
  );
}

function TodayOperationRow({
  operation,
  lowCoverage,
}: {
  operation: OperationWithService;
  lowCoverage: boolean;
}) {
  const navigate = useNavigate();
  const destination = buildOperationDetailHref(operation.id);

  const scheduleText = operation.scheduledEnd
    ? `${formatDateTime(operation.scheduledStart)} – ${formatDateTime(operation.scheduledEnd)}`
    : formatDateTime(operation.scheduledStart);

  const address = operation.service.address?.trim() ?? "—";

  const handleNavigate = () => navigate(destination);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  };

  return (
    <Box
      role="link"
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
      py={6}
      className={classes.operationRow}
    >
      <Group gap="xs" wrap="nowrap" align="center">
        <Text size="sm" fw={600} style={{ flex: 2.2, minWidth: 0 }} truncate>
          <EntityLink
            entityType="service"
            entityId={operation.serviceId ?? operation.service?.id}
            label={operation.service.name}
            stopPropagation
          />
        </Text>
        <Text size="xs" c="dimmed" style={{ flex: 2, minWidth: 0 }} truncate>
          {address}
        </Text>
        <Text size="xs" c="dimmed" style={{ flex: 1.6, minWidth: 0 }} truncate>
          {scheduleText}
        </Text>
        <Group gap={4} wrap="nowrap" justify="flex-end" style={{ flex: 1.2, minWidth: 0 }}>
          {lowCoverage ? (
            <StatusBadge label="Cobertura" tone="warning" variant="light" />
          ) : null}
          <StatusBadge
            label={operationStatusLabels[operation.status] ?? operation.status}
            tone="info"
            variant="light"
          />
        </Group>
      </Group>
    </Box>
  );
}

function attentionPanelDescription(
  panelState: ReturnType<typeof useHomeDashboard>["attentionPanelState"],
): string | undefined {
  if (panelState.status === "ready" || panelState.status === "partial") {
    return buildHomeAttentionSummary(panelState.model);
  }
  return undefined;
}

export function HomePage() {
  const dashboard = useHomeDashboard();
  const attentionDescription = attentionPanelDescription(dashboard.attentionPanelState);

  return (
    <>
      <PageHeader
        title="Inicio"
        description={`${dashboard.todayLabel} · Planificá · Detectá · Resolvé`}
      />

      {!dashboard.showOperationalContent ? (
        <SectionCard title="Estado de la operación" description="Resumen del entorno de la plataforma.">
          <Text size="sm" c="dimmed">
            Seleccioná una empresa y revisá los módulos habilitados para ver información operativa
            en el panel.
          </Text>
        </SectionCard>
      ) : (
        <Stack gap="md">
          {dashboard.canAccessReports ? (
            <Grid gap="md" align="stretch">
              <Grid.Col span={HOME_COL_MAIN} style={homeGridColStyle}>
                <DashboardTile>
                  <SectionCard
                    fillHeight
                    title="Situaciones que requieren atención"
                    description={attentionDescription}
                    action={
                      <Button
                        component={Link}
                        to={dashboard.statisticsPageHref}
                        variant="light"
                        color="accent"
                        size="xs"
                      >
                        Ver análisis
                      </Button>
                    }
                  >
                    <HomeAttentionPanel
                      panelState={dashboard.attentionPanelState}
                      linkContext={dashboard.linkContext}
                      dateRange={dashboard.today?.dateRange}
                    />
                  </SectionCard>
                </DashboardTile>
              </Grid.Col>
              <Grid.Col span={HOME_COL_SIDE} style={homeGridColStyle}>
                <DashboardTile>
                  <SectionCard
                    fillHeight
                    title="Estado de la operación"
                    description={`Cobertura y señales del día · ${dashboard.todayLabel}`}
                    action={
                      <Button
                        component={Link}
                        to={dashboard.statisticsPageHref}
                        variant="light"
                        size="xs"
                      >
                        Ver detalle
                      </Button>
                    }
                  >
                    {dashboard.summaryQuery.isError ? (
                      <ErrorState message={getApiErrorMessage(dashboard.summaryQuery.error)} />
                    ) : (
                      <HomeDashboardKpiCards
                        summary={dashboard.summary}
                        unavailableWorkdays={dashboard.unavailableWorkdays}
                        isLoading={dashboard.summaryQuery.isLoading}
                        unavailableLoading={dashboard.unavailableWorkdaysQuery.isLoading}
                        linkContext={dashboard.linkContext}
                      />
                    )}
                  </SectionCard>
                </DashboardTile>
              </Grid.Col>
            </Grid>
          ) : null}

          <Grid gap="md" align="stretch">
            {dashboard.canReadOperations ? (
              <Grid.Col
                span={dashboard.canAccessReports ? HOME_COL_MAIN : { base: 12, lg: 12 }}
                style={homeGridColStyle}
              >
                <DashboardTile>
                  <SectionCard
                    fillHeight
                    title={`${terminology.operation.plural} de ${dashboard.todayLabel.toLowerCase()}`}
                    description={`${dashboard.operationsTotal ?? 0} programada${(dashboard.operationsTotal ?? 0) === 1 ? "" : "s"} en el día`}
                    action={
                      <Button
                        component={Link}
                        to={dashboard.operationsListHref}
                        variant="light"
                        size="xs"
                      >
                        Ver listado
                      </Button>
                    }
                  >
                    {dashboard.todayOperationsQuery.isLoading ? <LoadingState height={72} /> : null}
                    {dashboard.todayOperationsQuery.isError ? (
                      <ErrorState
                        message={`No se pudieron cargar las ${terminology.operation.plural.toLowerCase()} de hoy.`}
                      />
                    ) : null}
                    {!dashboard.todayOperationsQuery.isLoading &&
                    !dashboard.todayOperationsQuery.isError &&
                    dashboard.todayOperationsQuery.data?.data.length === 0 ? (
                      <EmptyState
                        title={`No hay ${terminology.operation.plural.toLowerCase()} para hoy`}
                        description={`Cuando programes ${terminology.operation.plural.toLowerCase()} para esta fecha, aparecerán aquí.`}
                      />
                    ) : null}
                    {dashboard.todayOperationsQuery.data &&
                    dashboard.todayOperationsQuery.data.data.length > 0 ? (
                      <Stack gap={0}>
                        <TodayOperationsHeader />
                        {dashboard.todayOperationsQuery.data.data.map((operation) => (
                          <TodayOperationRow
                            key={operation.id}
                            operation={operation}
                            lowCoverage={dashboard.lowCoverageOperationIds.has(operation.id)}
                          />
                        ))}
                        {(dashboard.operationsTotal ?? 0) >
                        dashboard.todayOperationsQuery.data.data.length ? (
                          <Anchor
                            component={Link}
                            to={dashboard.operationsListHref}
                            size="sm"
                            mt="xs"
                          >
                            Ver todas ({dashboard.operationsTotal})
                          </Anchor>
                        ) : null}
                      </Stack>
                    ) : null}
                  </SectionCard>
                </DashboardTile>
              </Grid.Col>
            ) : null}

            {dashboard.canAccessReports ? (
              <Grid.Col
                span={
                  dashboard.canReadOperations ? HOME_COL_SIDE : { base: 12, lg: 12 }
                }
                style={homeGridColStyle}
              >
                <DashboardTile>
                  <SectionCard
                    fillHeight
                    title="Cobertura e incidencias"
                    description="Distribución de jornadas e incidencias operativas del día"
                  >
                    {dashboard.summaryQuery.isError ? (
                      <ErrorState message={getApiErrorMessage(dashboard.summaryQuery.error)} />
                    ) : (
                      <HomeOperationalHealth
                        summary={dashboard.summary}
                        isLoading={dashboard.summaryQuery.isLoading}
                        linkContext={dashboard.linkContext}
                      />
                    )}
                  </SectionCard>
                </DashboardTile>
              </Grid.Col>
            ) : null}
          </Grid>
        </Stack>
      )}
    </>
  );
}
