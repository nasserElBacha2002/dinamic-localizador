import { Button, Code, Group, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import {
  DataTable,
  ErrorState,
  FilterBar,
  FilterDateRangeInput,
  FilterSelect,
  LoadingState,
  PageHeader,
  PaginationControls,
  ResponsiveModal,
  StatusBadge,
  mapApiPaginationMeta,
  type DataTableColumn,
  type DataTableMobileCardConfig,
  type StatusBadgeTone,
} from "../../../design-system";
import { useAuth } from "../../../hooks/useAuth";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { useTableUrlState } from "../../../hooks/useTableUrlState";
import {
  useSystemLogContext,
  useSystemLogDetail,
  useSystemLogs,
  useSystemLogsOptions,
} from "../../../hooks/useSystemLogs";
import type { SystemLogLevel, SystemRuntimeLogRow } from "../../../types/system-logs";
import { dateRangeToUrlFields, urlFieldsToDateRange } from "../../../utils/date-range-url";
import { DISPLAY_FALLBACK, safeText } from "../../../utils/display-safe";
import { formatDateTime } from "../../../utils/dates";
import { getApiErrorMessage } from "../../../utils/errors";
import { isSystemLogsUiEnabled } from "../../../utils/system-logs-config";
import {
  buildSystemLogsListFilters,
  SYSTEM_LOGS_MAX_PAGE_SIZE,
  SYSTEM_LOGS_TABLE_DEFAULTS,
  SYSTEM_LOGS_TABLE_FIELDS,
  shouldOmitSystemLogsTableValue,
} from "./system-logs-list-table-state";

const TEXT_FILTER_DEBOUNCE_MS = 300;

const levelLabels: Record<SystemLogLevel, string> = {
  error: "Error",
  warn: "Advertencia",
  info: "Info",
};

const levelTone = (level: SystemLogLevel): StatusBadgeTone => {
  switch (level) {
    case "error":
      return "danger";
    case "warn":
      return "warning";
    case "info":
      return "info";
    default:
      return "neutral";
  }
};

function truncateText(value: string | null | undefined, max = 72): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DISPLAY_FALLBACK;
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

function truncateId(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DISPLAY_FALLBACK;
  }
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…`;
}

function buildSanitizedTechnicalInfo(row: SystemRuntimeLogRow): string {
  const payload = {
    id: row.id,
    schemaVersion: row.schemaVersion,
    occurredAt: row.occurredAt,
    level: row.level,
    service: row.service,
    serviceInstanceId: row.serviceInstanceId,
    environment: row.environment,
    module: row.module,
    event: row.event,
    message: row.message,
    errorCode: row.errorCode,
    requestId: row.requestId,
    correlationId: row.correlationId,
    companyId: row.companyId,
    operationId: row.operationId,
    employeeId: row.employeeId,
    conversationId: row.conversationId,
    jobExecutionId: row.jobExecutionId,
    metadata: row.metadata,
    error:
      row.errorName || row.errorMessage || row.errorStack
        ? {
            name: row.errorName,
            message: row.errorMessage,
            stack: row.errorStack,
          }
        : null,
    createdAt: row.createdAt,
  };
  return JSON.stringify(payload, null, 2);
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" style={{ wordBreak: "break-word" }}>
        {safeText(value)}
      </Text>
    </Stack>
  );
}

function SystemLogDetailDrawer({
  logId,
  opened,
  onClose,
}: {
  logId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const detailQuery = useSystemLogDetail(logId, opened);
  const contextQuery = useSystemLogContext(logId, opened);
  const row = detailQuery.data;

  const contextColumns = useMemo<DataTableColumn<SystemRuntimeLogRow>[]>(
    () => [
      {
        key: "occurredAt",
        header: "Fecha/hora",
        getValue: (item) => formatDateTime(item.occurredAt),
      },
      {
        key: "level",
        header: "Nivel",
        render: (item) => (
          <StatusBadge label={levelLabels[item.level]} tone={levelTone(item.level)} />
        ),
      },
      {
        key: "module",
        header: "Módulo",
        getValue: (item) => item.module,
      },
      {
        key: "event",
        header: "Evento",
        getValue: (item) => item.event,
      },
      {
        key: "message",
        header: "Mensaje",
        getValue: (item) => truncateText(item.message, 96),
      },
    ],
    [],
  );

  const copyRequestId = async () => {
    if (!row?.requestId) {
      return;
    }
    await navigator.clipboard.writeText(row.requestId);
  };

  const copyTechnicalInfo = async () => {
    if (!row) {
      return;
    }
    await navigator.clipboard.writeText(buildSanitizedTechnicalInfo(row));
  };

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Detalle del log"
      size="xl"
      bodyMode="scroll"
      footer={
        row ? (
          <Group justify="flex-end" gap="sm">
            <Button variant="default" disabled={!row.requestId} onClick={() => void copyRequestId()}>
              Copiar request ID
            </Button>
            <Button variant="light" onClick={() => void copyTechnicalInfo()}>
              Copiar info técnica
            </Button>
          </Group>
        ) : null
      }
    >
      <Stack gap="md">
        {detailQuery.isPending ? <LoadingState /> : null}
        {detailQuery.isError ? (
          <ErrorState message={getApiErrorMessage(detailQuery.error)} />
        ) : null}
        {row ? (
          <>
            <Group gap="sm">
              <StatusBadge label={levelLabels[row.level]} tone={levelTone(row.level)} />
              <Text size="sm" c="dimmed">
                {formatDateTime(row.occurredAt)}
              </Text>
            </Group>

            <DetailField label="Módulo" value={row.module} />
            <DetailField label="Evento" value={row.event} />
            <DetailField label="Mensaje" value={row.message} />
            <DetailField label="Request ID" value={row.requestId} />
            <DetailField label="Correlation ID" value={row.correlationId} />
            <DetailField label="Compañía" value={row.companyId} />
            <DetailField label="Operación" value={row.operationId} />
            <DetailField label="Colaborador" value={row.employeeId} />
            <DetailField label="Job execution ID" value={row.jobExecutionId} />
            <DetailField label="Código de error" value={row.errorCode} />
            <DetailField label="Servicio" value={`${row.service} (${row.environment})`} />

            {row.conversationId ? (
              <Button
                component={RouterLink}
                to={`/platform/observability/whatsapp/${row.conversationId}`}
                variant="light"
                size="compact-sm"
              >
                Ver conversación WhatsApp
              </Button>
            ) : null}

            {row.errorName || row.errorMessage ? (
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Error
                </Text>
                <DetailField label="Nombre" value={row.errorName} />
                <DetailField label="Mensaje" value={row.errorMessage} />
                {row.errorStack ? (
                  <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {row.errorStack}
                  </Code>
                ) : null}
              </Stack>
            ) : null}

            {row.metadata ? (
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Metadata
                </Text>
                <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {JSON.stringify(row.metadata, null, 2)}
                </Code>
              </Stack>
            ) : null}

            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Contexto relacionado
                {contextQuery.data?.meta.correlationKey
                  ? ` (${contextQuery.data.meta.correlationKey})`
                  : null}
              </Text>
              {contextQuery.isPending ? <LoadingState height={120} /> : null}
              {contextQuery.isError ? (
                <ErrorState message={getApiErrorMessage(contextQuery.error)} />
              ) : null}
              {!contextQuery.isPending && !contextQuery.isError ? (
                <DataTable
                  rows={contextQuery.data?.data ?? []}
                  columns={contextColumns}
                  getRowKey={(item) => item.id}
                  emptyTitle="Sin logs relacionados en la ventana de contexto"
                  aria-label="Logs de contexto"
                />
              ) : null}
            </Stack>
          </>
        ) : null}
      </Stack>
    </ResponsiveModal>
  );
}

export function SystemLogsPage() {
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const uiEnabled = isSystemLogsUiEnabled();
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const table = useTableUrlState({
    defaults: SYSTEM_LOGS_TABLE_DEFAULTS,
    fields: SYSTEM_LOGS_TABLE_FIELDS,
    shouldOmitFromUrl: shouldOmitSystemLogsTableValue,
  });

  const dateRange = useMemo(
    () =>
      urlFieldsToDateRange({
        datePreset: table.state.datePreset,
        dateFrom: table.state.dateFrom,
        dateTo: table.state.dateTo,
      }),
    [table.state.dateFrom, table.state.datePreset, table.state.dateTo],
  );

  const debouncedQ = useDebouncedValue(table.state.q, TEXT_FILTER_DEBOUNCE_MS);
  const debouncedRequestId = useDebouncedValue(table.state.requestId, TEXT_FILTER_DEBOUNCE_MS);

  const listFilters = useMemo(
    () =>
      buildSystemLogsListFilters({
        state: {
          ...table.state,
          requestId: debouncedRequestId,
        },
        dateRange,
        q: debouncedQ,
      }),
    [dateRange, debouncedQ, debouncedRequestId, table.state],
  );

  const canFetch = isPlatformAdmin && uiEnabled;
  const logsQuery = useSystemLogs(listFilters, canFetch);
  const optionsQuery = useSystemLogsOptions(canFetch);

  const levelOptions = useMemo(
    () => [
      { value: "", label: "Todos los niveles" },
      ...(optionsQuery.data?.levels ?? ["error", "warn", "info"]).map((level) => ({
        value: level,
        label: levelLabels[level as SystemLogLevel] ?? level,
      })),
    ],
    [optionsQuery.data?.levels],
  );

  const moduleOptions = useMemo(
    () => [
      { value: "", label: "Todos los módulos" },
      ...(optionsQuery.data?.modules ?? []).map((module) => ({ value: module, label: module })),
    ],
    [optionsQuery.data?.modules],
  );

  const eventOptions = useMemo(
    () => [
      { value: "", label: "Todos los eventos" },
      ...(optionsQuery.data?.events ?? []).map((event) => ({ value: event, label: event })),
    ],
    [optionsQuery.data?.events],
  );

  const columns = useMemo<DataTableColumn<SystemRuntimeLogRow>[]>(
    () => [
      {
        key: "occurredAt",
        header: "Fecha/hora",
        getValue: (row) => formatDateTime(row.occurredAt),
      },
      {
        key: "level",
        header: "Nivel",
        render: (row) => (
          <StatusBadge label={levelLabels[row.level]} tone={levelTone(row.level)} />
        ),
      },
      {
        key: "module",
        header: "Módulo",
        getValue: (row) => row.module,
      },
      {
        key: "event",
        header: "Evento",
        getValue: (row) => row.event,
      },
      {
        key: "companyId",
        header: "Compañía",
        getValue: (row) => truncateId(row.companyId),
      },
      {
        key: "message",
        header: "Mensaje",
        getValue: (row) => truncateText(row.message),
      },
      {
        key: "requestId",
        header: "Request ID",
        getValue: (row) => truncateId(row.requestId),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<SystemRuntimeLogRow>>(
    () => ({
      title: (row) => row.event,
      status: (row) => (
        <StatusBadge label={levelLabels[row.level]} tone={levelTone(row.level)} />
      ),
      fields: [
        {
          key: "occurredAt",
          label: "Fecha/hora",
          getValue: (row) => formatDateTime(row.occurredAt),
          visibility: "always",
        },
        {
          key: "module",
          label: "Módulo",
          getValue: (row) => row.module,
          visibility: "always",
        },
        {
          key: "message",
          label: "Mensaje",
          getValue: (row) => truncateText(row.message, 48),
          visibility: "always",
        },
      ],
    }),
    [],
  );

  if (!uiEnabled) {
    return (
      <ErrorState message="Los logs del sistema no están habilitados en este entorno." />
    );
  }

  if (!isPlatformAdmin) {
    return (
      <ErrorState message="Solo un superadministrador de plataforma puede acceder a los logs del sistema." />
    );
  }

  return (
    <>
      <PageHeader
        title="Logs del sistema"
        description="Registros técnicos de runtime del backend para diagnóstico y auditoría operativa."
        action={
          <Group gap="sm">
            <Button component={RouterLink} to="/platform/observability/whatsapp" variant="default">
              Observabilidad WhatsApp
            </Button>
            <Button
              component={RouterLink}
              to="/platform/observability/whatsapp/costs"
              variant="default"
            >
              Costos de mensajería
            </Button>
            <Button
              component={RouterLink}
              to="/platform/observability/whatsapp/errors"
              variant="default"
            >
              Ver errores
            </Button>
          </Group>
        }
      />

      <FilterBar
        search={
          <TextInput
            label="Búsqueda"
            value={table.state.q}
            onChange={(event) => table.setField("q", event.currentTarget.value)}
            placeholder="Texto en mensaje, evento o código…"
          />
        }
        activeFilterCount={table.activeFilterCount}
        onClearFilters={table.resetFilters}
        actions={
          <Button variant="light" onClick={() => void logsQuery.refetch()}>
            Refrescar
          </Button>
        }
      >
        <FilterBar.Item>
          <FilterDateRangeInput
            value={dateRange}
            onChange={(nextDateRange) => {
              table.setState(dateRangeToUrlFields(nextDateRange));
            }}
            mode="past"
            label="Período"
            allowCustomRange
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Nivel"
            value={table.state.level}
            onChange={(nextValue) => table.setField("level", nextValue)}
            data={levelOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Módulo"
            value={table.state.module}
            onChange={(nextValue) => table.setField("module", nextValue)}
            data={moduleOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Evento"
            value={table.state.event}
            onChange={(nextValue) => table.setField("event", nextValue)}
            data={eventOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <TextInput
            label="Request ID"
            value={table.state.requestId}
            onChange={(event) => table.setField("requestId", event.currentTarget.value)}
            placeholder="UUID o identificador de request"
          />
        </FilterBar.Item>
      </FilterBar>

      {logsQuery.isPending ? <LoadingState /> : null}

      {!logsQuery.isPending ? (
        <DataTable
          rows={logsQuery.data?.data ?? []}
          columns={columns}
          getRowKey={(row) => row.id}
          error={logsQuery.isError ? getApiErrorMessage(logsQuery.error) : undefined}
          emptyTitle="No hay logs para los filtros seleccionados"
          emptyDescription="Ajustá el período o los filtros para ver actividad del sistema."
          aria-label="Logs del sistema"
          mobileView="cards"
          mobileCard={mobileCard}
          onRowClick={(row) => setSelectedLogId(row.id)}
          pagination={
            logsQuery.data && logsQuery.data.data.length > 0 ? (
              <PaginationControls
                meta={mapApiPaginationMeta(logsQuery.data.meta)}
                onPageChange={table.onPageChange}
                pageSize={table.pageSize}
                onPageSizeChange={table.onPageSizeChange}
                pageSizeOptions={[10, 20, SYSTEM_LOGS_MAX_PAGE_SIZE]}
                showPageSizeSelector
              />
            ) : undefined
          }
        />
      ) : null}

      {selectedLogId ? (
        <SystemLogDetailDrawer
          logId={selectedLogId}
          opened={Boolean(selectedLogId)}
          onClose={() => setSelectedLogId(null)}
        />
      ) : null}
    </>
  );
}
