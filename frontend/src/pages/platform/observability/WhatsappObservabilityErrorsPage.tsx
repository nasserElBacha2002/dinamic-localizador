import { Button, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import {
  DataTable,
  ErrorState,
  FilterBar,
  FilterDateRangeInput,
  LoadingState,
  PageHeader,
  PaginationControls,
  SectionCard,
  StatusBadge,
  mapApiPaginationMeta,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../../design-system";
import { useAuth } from "../../../hooks/useAuth";
import { useTableUrlState } from "../../../hooks/useTableUrlState";
import { useWhatsappErrorDetail, useWhatsappErrors } from "../../../hooks/useWhatsappObservability";
import type { WhatsappErrorAggregation } from "../../../types/whatsapp-observability";
import { EMPTY_DATE_RANGE_VALUE } from "../../../utils/date-range";
import { dateRangeToUrlFields, urlFieldsToDateRange } from "../../../utils/date-range-url";
import { formatDateTime } from "../../../utils/dates";
import { getApiErrorMessage } from "../../../utils/errors";
import { isWhatsappObservabilityUiEnabled } from "../../../utils/whatsapp-observability-config";
import {
  toObservabilityActivityBounds,
  WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
  shouldOmitWhatsappObservabilityTableValue,
} from "./whatsapp-observability-list-table-state";

const ERRORS_PATH = "/platform/observability/whatsapp/errors";

export function WhatsappObservabilityErrorsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedCode = searchParams.get("code");
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const uiEnabled = isWhatsappObservabilityUiEnabled();

  const table = useTableUrlState({
    defaults: {
      ...WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
      ...dateRangeToUrlFields(EMPTY_DATE_RANGE_VALUE),
    },
    shouldOmitFromUrl: shouldOmitWhatsappObservabilityTableValue,
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
  const activityBounds = useMemo(() => toObservabilityActivityBounds(dateRange), [dateRange]);

  const errorsQuery = useWhatsappErrors(
    {
      page: table.page,
      limit: table.pageSize,
      from: activityBounds.from,
      to: activityBounds.to,
    },
    isPlatformAdmin && uiEnabled,
  );
  const errorDetailQuery = useWhatsappErrorDetail(
    selectedCode ?? undefined,
    isPlatformAdmin && uiEnabled && Boolean(selectedCode),
  );

  const columns = useMemo<DataTableColumn<WhatsappErrorAggregation>[]>(
    () => [
      {
        key: "errorCode",
        header: "Código de error",
        render: (row) => <StatusBadge label={row.errorCode} tone="danger" />,
      },
      {
        key: "count",
        header: "Ocurrencias",
        getValue: (row) => String(row.count),
      },
      {
        key: "lastSeenAt",
        header: "Última vez",
        getValue: (row) => formatDateTime(row.lastSeenAt),
      },
      {
        key: "sampleConversationId",
        header: "Conversación de ejemplo",
        getValue: (row) => row.sampleConversationId ?? "—",
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<WhatsappErrorAggregation>>(
    () => ({
      title: (row) => row.errorCode,
      status: (row) => <StatusBadge label={`${row.count}×`} tone="danger" />,
      fields: [
        {
          key: "lastSeenAt",
          label: "Última vez",
          getValue: (row) => formatDateTime(row.lastSeenAt),
          visibility: "always",
        },
      ],
    }),
    [],
  );

  if (!uiEnabled) {
    return <ErrorState message="La observabilidad de WhatsApp no está habilitada en este entorno." />;
  }

  if (!isPlatformAdmin) {
    return (
      <ErrorState message="Solo un superadministrador de plataforma puede acceder a la observabilidad de WhatsApp." />
    );
  }

  return (
    <>
      <PageHeader
        title="Errores de WhatsApp"
        description="Errores agrupados por código detectados en flujos y mensajes."
        action={
          <Button component={RouterLink} to="/platform/observability/whatsapp" variant="default">
            Volver a conversaciones
          </Button>
        }
      />

      <FilterBar activeFilterCount={table.activeFilterCount} onClearFilters={table.resetFilters}>
        <FilterDateRangeInput
          value={dateRange}
          onChange={(nextDateRange) => {
            table.setState(dateRangeToUrlFields(nextDateRange));
          }}
          mode="mixed"
          label="Período"
          allowCustomRange
        />
      </FilterBar>

      {errorsQuery.isPending ? <LoadingState /> : null}

      {!errorsQuery.isPending ? (
        <DataTable
          rows={errorsQuery.data?.data ?? []}
          columns={columns}
          getRowKey={(row) => row.errorCode}
          error={errorsQuery.isError ? getApiErrorMessage(errorsQuery.error) : undefined}
          emptyTitle="No hay errores para el período seleccionado"
          emptyDescription="Los errores aparecerán aquí cuando se registren en producción."
          aria-label="Errores de WhatsApp"
          mobileView="cards"
          mobileCard={mobileCard}
          onRowClick={(row) => {
            if (row.sampleConversationId) {
              navigate(`/platform/observability/whatsapp/${row.sampleConversationId}`);
              return;
            }
            navigate(`${ERRORS_PATH}?code=${encodeURIComponent(row.errorCode)}`);
          }}
          pagination={
            errorsQuery.data && errorsQuery.data.data.length > 0 ? (
              <PaginationControls
                meta={mapApiPaginationMeta(errorsQuery.data.meta)}
                onPageChange={table.onPageChange}
                pageSize={table.pageSize}
                onPageSizeChange={table.onPageSizeChange}
                showPageSizeSelector
              />
            ) : undefined
          }
        />
      ) : null}

      {selectedCode ? (
        <SectionCard
          title={`Detalle: ${selectedCode}`}
          description="Muestras recientes del código seleccionado."
        >
          {errorDetailQuery.isPending ? <LoadingState /> : null}
          {errorDetailQuery.isError ? (
            <ErrorState message={getApiErrorMessage(errorDetailQuery.error)} />
          ) : null}
          {errorDetailQuery.data ? (
            <Stack gap="sm">
              <Text size="sm">
                Ocurrencias (muestra): {errorDetailQuery.data.count}. Última:{" "}
                {formatDateTime(errorDetailQuery.data.lastSeenAt)}
              </Text>
              {errorDetailQuery.data.samples.map((sample) => (
                <Text key={`${sample.flowExecutionId}-${sample.occurredAt}`} size="sm">
                  {formatDateTime(sample.occurredAt)} — {sample.resultCode ?? "—"} —{" "}
                  {sample.errorMessage ?? "sin detalle"}
                  {sample.conversationId ? (
                    <>
                      {" "}
                      <Button
                        component={RouterLink}
                        to={`/platform/observability/whatsapp/${sample.conversationId}`}
                        size="compact-xs"
                        variant="subtle"
                      >
                        Ver conversación
                      </Button>
                    </>
                  ) : null}
                </Text>
              ))}
            </Stack>
          ) : null}
        </SectionCard>
      ) : null}
    </>
  );
}
