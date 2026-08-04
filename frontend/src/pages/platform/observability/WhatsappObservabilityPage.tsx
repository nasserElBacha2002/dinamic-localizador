import { Button, Group, TextInput } from "@mantine/core";
import { useMemo } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import {
  DataTable,
  ErrorState,
  FilterBar,
  FilterDateRangeInput,
  FilterSelect,
  LoadingState,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../../design-system";
import { useAuth } from "../../../hooks/useAuth";
import { useTableUrlState } from "../../../hooks/useTableUrlState";
import { useWhatsappConversations } from "../../../hooks/useWhatsappObservability";
import type { WhatsappConversationSummary } from "../../../types/whatsapp-observability";
import { getDateRangeQueryValue } from "../../../utils/date-range";
import { dateRangeToUrlFields, urlFieldsToDateRange } from "../../../utils/date-range-url";
import { formatDateTime } from "../../../utils/dates";
import { getApiErrorMessage } from "../../../utils/errors";
import { isWhatsappObservabilityUiEnabled } from "../../../utils/whatsapp-observability-config";
import {
  conversationStatusTone,
  whatsappConversationStatusOptions,
  whatsappConversationStatusLabels,
  whatsappHasErrorOptions,
} from "./whatsapp-observability-labels";
import {
  WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
  WHATSAPP_OBSERVABILITY_TABLE_FIELDS,
  shouldOmitWhatsappObservabilityTableValue,
} from "./whatsapp-observability-list-table-state";

const LIST_PATH = "/platform/observability/whatsapp";

export function WhatsappObservabilityPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const uiEnabled = isWhatsappObservabilityUiEnabled();

  const table = useTableUrlState({
    defaults: WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
    fields: WHATSAPP_OBSERVABILITY_TABLE_FIELDS,
    shouldOmitFromUrl: shouldOmitWhatsappObservabilityTableValue,
    debounceSearch: true,
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
  const dateQuery = getDateRangeQueryValue(dateRange);

  const conversationsQuery = useWhatsappConversations(
    {
      page: table.page,
      limit: table.pageSize,
      search: table.state.search || undefined,
      phone: table.state.phone || undefined,
      flowType: table.state.flowType || undefined,
      resultCode: table.state.resultCode || undefined,
      status: (table.state.status || undefined) as WhatsappConversationSummary["status"] | undefined,
      hasError:
        table.state.hasError === "true"
          ? true
          : table.state.hasError === "false"
            ? false
            : undefined,
      from: dateQuery.from,
      to: dateQuery.to,
    },
    isPlatformAdmin && uiEnabled,
  );

  const columns = useMemo<DataTableColumn<WhatsappConversationSummary>[]>(
    () => [
      {
        key: "phoneMasked",
        header: "Teléfono",
        getValue: (row) => row.phoneMasked,
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={whatsappConversationStatusLabels[row.status]}
            tone={conversationStatusTone(row.status)}
          />
        ),
      },
      {
        key: "lastFlowType",
        header: "Flujo",
        getValue: (row) => row.lastFlowType ?? "—",
      },
      {
        key: "lastResultCode",
        header: "Resultado",
        getValue: (row) => row.lastResultCode ?? "—",
      },
      {
        key: "messageCount",
        header: "Mensajes",
        getValue: (row) => String(row.messageCount),
      },
      {
        key: "errorCount",
        header: "Errores",
        render: (row) =>
          row.errorCount > 0 ? (
            <StatusBadge label={String(row.errorCount)} tone="danger" />
          ) : (
            <span>0</span>
          ),
      },
      {
        key: "lastActivityAt",
        header: "Última actividad",
        getValue: (row) => formatDateTime(row.lastActivityAt),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<WhatsappConversationSummary>>(
    () => ({
      title: (row) => row.phoneMasked,
      status: (row) => (
        <StatusBadge
          label={whatsappConversationStatusLabels[row.status]}
          tone={conversationStatusTone(row.status)}
        />
      ),
      fields: [
        {
          key: "lastFlowType",
          label: "Flujo",
          getValue: (row) => row.lastFlowType ?? "—",
          visibility: "always",
        },
        {
          key: "lastResultCode",
          label: "Resultado",
          getValue: (row) => row.lastResultCode ?? "—",
          visibility: "always",
        },
        {
          key: "lastActivityAt",
          label: "Última actividad",
          getValue: (row) => formatDateTime(row.lastActivityAt),
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
        title="Observabilidad WhatsApp"
        description="Revisá conversaciones, flujos y errores del bot de WhatsApp en producción."
        action={
          <Group gap="sm">
            <Button component={RouterLink} to={`${LIST_PATH}/errors`} variant="default">
              Ver errores
            </Button>
          </Group>
        }
      />

      <FilterBar
        search={
          <SearchInput
            value={table.searchInput}
            onChange={table.setSearch}
            onSearch={table.commitSearch}
            label="Búsqueda general"
            placeholder="Buscar por teléfono, empleado o ID…"
            aria-label="Buscar conversaciones"
          />
        }
        activeFilterCount={table.activeFilterCount}
        onClearFilters={table.resetFilters}
      >
        <FilterBar.Item>
          <FilterDateRangeInput
            value={dateRange}
            onChange={(nextDateRange) => {
              table.setState(dateRangeToUrlFields(nextDateRange));
            }}
            mode="mixed"
            label="Actividad"
            allowCustomRange
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <TextInput
            label="Teléfono"
            value={table.state.phone}
            onChange={(event) => table.setField("phone", event.currentTarget.value)}
            placeholder="Ej. ****1234"
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <TextInput
            label="Tipo de flujo"
            value={table.state.flowType}
            onChange={(event) => table.setField("flowType", event.currentTarget.value)}
            placeholder="Ej. CHECKIN"
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <TextInput
            label="Código de resultado"
            value={table.state.resultCode}
            onChange={(event) => table.setField("resultCode", event.currentTarget.value)}
            placeholder="Ej. CHECKIN_COMPLETED"
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Estado"
            value={table.state.status}
            onChange={(nextValue) => table.setField("status", nextValue)}
            data={whatsappConversationStatusOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Errores"
            value={table.state.hasError}
            onChange={(nextValue) => table.setField("hasError", nextValue)}
            data={whatsappHasErrorOptions}
          />
        </FilterBar.Item>
      </FilterBar>

      {conversationsQuery.isPending ? <LoadingState /> : null}

      {!conversationsQuery.isPending ? (
        <DataTable
          rows={conversationsQuery.data?.data ?? []}
          columns={columns}
          getRowKey={(row) => row.id}
          error={
            conversationsQuery.isError ? getApiErrorMessage(conversationsQuery.error) : undefined
          }
          emptyTitle="No hay conversaciones para los filtros seleccionados"
          emptyDescription="Ajustá los filtros o esperá actividad nueva del bot."
          aria-label="Conversaciones de WhatsApp"
          mobileView="cards"
          mobileCard={mobileCard}
          onRowClick={(row) => navigate(`${LIST_PATH}/${row.id}`)}
          pagination={
            conversationsQuery.data && conversationsQuery.data.data.length > 0 ? (
              <PaginationControls
                meta={mapApiPaginationMeta(conversationsQuery.data.meta)}
                onPageChange={table.onPageChange}
                pageSize={table.pageSize}
                onPageSizeChange={table.onPageSizeChange}
                showPageSizeSelector
              />
            ) : undefined
          }
        />
      ) : null}
    </>
  );
}
