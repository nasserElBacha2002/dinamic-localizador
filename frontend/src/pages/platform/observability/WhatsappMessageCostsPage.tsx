import { Alert, Button, Group, Select, SimpleGrid, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import {
  DataTable,
  ErrorState,
  FilterBar,
  FilterSelect,
  LoadingState,
  PageHeader,
  PaginationControls,
  SectionCard,
  StatusBadge,
  mapApiPaginationMeta,
  type DataTableColumn,
} from "../../../design-system";
import { useAuth } from "../../../hooks/useAuth";
import { usePlatformCompanies } from "../../../hooks/usePlatformCompanies";
import {
  downloadWhatsappMessageCostCsv,
  useWhatsappMessageCostByCompany,
  useWhatsappMessageCostByTemplate,
  useWhatsappMessageCostDetail,
  useWhatsappMessageCostResync,
  useWhatsappMessageCostSummary,
} from "../../../hooks/useWhatsappMessageCosts";
import type {
  MessageCostCompanyBreakdownItem,
  MessageCostDetailRow,
  MessageCostQuality,
  MessageCostTemplateBreakdownItem,
} from "../../../types/whatsapp-message-cost";
import { formatDateTime } from "../../../utils/dates";
import { getApiErrorMessage } from "../../../utils/errors";
import { isSystemLogsUiEnabled } from "../../../utils/system-logs-config";
import { isWhatsappObservabilityUiEnabled } from "../../../utils/whatsapp-observability-config";

const COSTS_PATH = "/platform/observability/whatsapp/costs";

const qualityTone = (
  quality: MessageCostQuality,
): "success" | "warning" | "neutral" | "danger" => {
  switch (quality) {
    case "CONFIRMED":
      return "success";
    case "ESTIMATED":
      return "warning";
    case "PENDING":
      return "neutral";
    case "UNAVAILABLE":
      return "danger";
    default:
      return "neutral";
  }
};

const qualityLabel: Record<MessageCostQuality, string> = {
  CONFIRMED: "Confirmado",
  ESTIMATED: "Estimado",
  PENDING: "Pendiente",
  UNAVAILABLE: "No disponible",
};

const monthOptions = Array.from({ length: 12 }, (_, index) => {
  const month = index + 1;
  return {
    value: String(month),
    label: new Date(2020, index, 1).toLocaleString("es-AR", { month: "long" }),
  };
});

function formatMoney(amount: string | null | undefined, currency: string | null | undefined) {
  if (!amount) {
    return "—";
  }
  const suffix = currency && currency !== "UNK" ? ` ${currency}` : "";
  return `${amount}${suffix}`;
}

export function WhatsappMessageCostsPage() {
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const uiEnabled = isWhatsappObservabilityUiEnabled();
  const systemLogsEnabled = isSystemLogsUiEnabled();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [costQuality, setCostQuality] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({
      year: Number(year),
      month: Number(month),
      companyId: companyId || undefined,
      costQuality: (costQuality as MessageCostQuality | null) || undefined,
      messageKind: messageKind || undefined,
      page,
      limit: 20,
    }),
    [year, month, companyId, costQuality, messageKind, page],
  );

  const monthFilters = useMemo(
    () => ({
      year: filters.year,
      month: filters.month,
      companyId: filters.companyId,
      costQuality: filters.costQuality,
      messageKind: filters.messageKind,
    }),
    [filters],
  );

  const enabled = isPlatformAdmin && uiEnabled;
  const summaryQuery = useWhatsappMessageCostSummary(monthFilters, enabled);
  const companyQuery = useWhatsappMessageCostByCompany(monthFilters, enabled);
  const templateQuery = useWhatsappMessageCostByTemplate(monthFilters, enabled);
  const detailQuery = useWhatsappMessageCostDetail(filters, enabled);
  const companiesQuery = usePlatformCompanies();
  const resyncMutation = useWhatsappMessageCostResync();

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 6 }, (_, i) => {
      const value = String(current - i);
      return { value, label: value };
    });
  }, [now]);

  const companyOptions = useMemo(
    () => [
      { value: "", label: "Todas las empresas" },
      ...(companiesQuery.data ?? []).map((company) => ({
        value: company.id,
        label: company.name,
      })),
    ],
    [companiesQuery.data],
  );

  const companyColumns = useMemo<DataTableColumn<MessageCostCompanyBreakdownItem>[]>(
    () => [
      {
        key: "companyName",
        header: "Empresa",
        getValue: (row) => row.companyName ?? "(sin empresa)",
      },
      {
        key: "currency",
        header: "Moneda",
        getValue: (row) => row.currency ?? "—",
      },
      {
        key: "confirmedTotal",
        header: "Confirmado",
        getValue: (row) => formatMoney(row.confirmedTotal, row.currency),
      },
      {
        key: "estimatedTotal",
        header: "Estimado",
        getValue: (row) => formatMoney(row.estimatedTotal, row.currency),
      },
      {
        key: "messageCount",
        header: "Mensajes",
        getValue: (row) => String(row.messageCount),
      },
      {
        key: "pendingCount",
        header: "Pendientes",
        getValue: (row) => String(row.pendingCount),
      },
    ],
    [],
  );

  const templateColumns = useMemo<DataTableColumn<MessageCostTemplateBreakdownItem>[]>(
    () => [
      {
        key: "flowLabel",
        header: "Flujo / tipo",
        getValue: (row) => row.flowLabel ?? row.messageKind,
      },
      {
        key: "templateSid",
        header: "Plantilla",
        getValue: (row) => row.templateName ?? row.templateSid ?? "—",
      },
      {
        key: "pricingCategory",
        header: "Categoría",
        getValue: (row) => row.pricingCategory ?? "—",
      },
      {
        key: "currency",
        header: "Moneda",
        getValue: (row) => row.currency ?? "—",
      },
      {
        key: "confirmedTotal",
        header: "Confirmado",
        getValue: (row) => formatMoney(row.confirmedTotal, row.currency),
      },
      {
        key: "estimatedTotal",
        header: "Estimado",
        getValue: (row) => formatMoney(row.estimatedTotal, row.currency),
      },
      {
        key: "messageCount",
        header: "Mensajes",
        getValue: (row) => String(row.messageCount),
      },
    ],
    [],
  );

  const detailColumns = useMemo<DataTableColumn<MessageCostDetailRow>[]>(
    () => [
      {
        key: "sentAt",
        header: "Envío",
        getValue: (row) => formatDateTime(row.sentAt),
      },
      {
        key: "recipientPhoneMasked",
        header: "Destinatario",
        getValue: (row) => row.recipientPhoneMasked ?? "—",
      },
      {
        key: "flowLabel",
        header: "Tipo",
        getValue: (row) => row.flowLabel ?? row.messageKind,
      },
      {
        key: "providerStatus",
        header: "Estado Twilio",
        getValue: (row) => row.providerStatus ?? "—",
      },
      {
        key: "costQuality",
        header: "Calidad",
        render: (row) => (
          <StatusBadge label={qualityLabel[row.costQuality]} tone={qualityTone(row.costQuality)} />
        ),
      },
      {
        key: "priceAmount",
        header: "Importe",
        getValue: (row) => formatMoney(row.priceAmount, row.currency),
      },
      {
        key: "costSource",
        header: "Fuente",
        getValue: (row) => row.costSource,
      },
    ],
    [],
  );

  if (!isPlatformAdmin) {
    return <ErrorState title="Acceso denegado" message="Solo administradores de plataforma." />;
  }

  if (!uiEnabled) {
    return (
      <ErrorState
        title="Observabilidad deshabilitada"
        message="La UI de observabilidad WhatsApp está desactivada."
      />
    );
  }

  const summary = summaryQuery.data;

  return (
    <Stack gap="md">
      <PageHeader
        title="Costos de mensajería"
        description="Costos de canal Twilio (Message.price). No incluye tarifas Meta de plantilla."
        action={
          <Group gap="xs">
            <Button component={RouterLink} to="/platform/observability/whatsapp" variant="default">
              Conversaciones
            </Button>
            <Button
              component={RouterLink}
              to="/platform/observability/whatsapp/errors"
              variant="default"
            >
              Errores
            </Button>
            {systemLogsEnabled ? (
              <Button
                component={RouterLink}
                to="/platform/observability/system-logs"
                variant="default"
              >
                Logs del sistema
              </Button>
            ) : null}
          </Group>
        }
      />

      <FilterBar>
        <Select
          label="Año"
          data={yearOptions}
          value={year}
          onChange={(value) => {
            if (value) {
              setYear(value);
              setPage(1);
            }
          }}
        />
        <Select
          label="Mes"
          data={monthOptions}
          value={month}
          onChange={(value) => {
            if (value) {
              setMonth(value);
              setPage(1);
            }
          }}
        />
        <FilterSelect
          label="Empresa"
          data={companyOptions}
          value={companyId ?? ""}
          onChange={(value) => {
            setCompanyId(value || null);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Calidad de costo"
          data={[
            { value: "", label: "Todas" },
            { value: "CONFIRMED", label: "Confirmado" },
            { value: "ESTIMATED", label: "Estimado" },
            { value: "PENDING", label: "Pendiente" },
            { value: "UNAVAILABLE", label: "No disponible" },
          ]}
          value={costQuality ?? ""}
          onChange={(value) => {
            setCostQuality(value || null);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Tipo de mensaje"
          data={[
            { value: "", label: "Todos" },
            { value: "TEMPLATE", label: "Plantilla" },
            { value: "DOCUMENT", label: "Documento" },
            { value: "TEXT", label: "Texto" },
            { value: "BOT_TWIML", label: "Bot TwiML" },
          ]}
          value={messageKind ?? ""}
          onChange={(value) => {
            setMessageKind(value || null);
            setPage(1);
          }}
        />
        <Button
          variant="default"
          onClick={() => {
            void downloadWhatsappMessageCostCsv(monthFilters);
          }}
        >
          Exportar CSV
        </Button>
        <Button
          loading={resyncMutation.isPending}
          onClick={() => {
            resyncMutation.mutate({
              year: filters.year,
              month: filters.month,
              companyId: filters.companyId,
            });
          }}
        >
          Re-sincronizar
        </Button>
      </FilterBar>

      {summaryQuery.isLoading ? <LoadingState message="Cargando costos..." /> : null}
      {summaryQuery.isError ? (
        <ErrorState
          title="No se pudieron cargar los costos"
          message={getApiErrorMessage(summaryQuery.error)}
        />
      ) : null}

      {summary && summary.workerOperationalStatus === "PROVIDER_NOT_CONFIGURED" ? (
        <Alert color="yellow" title="Proveedor sin configurar">
          Twilio no tiene credenciales en este entorno. No se pueden confirmar costos.
        </Alert>
      ) : null}

      {summary && summary.workerOperationalStatus === "WORKER_DISABLED" ? (
        <Alert color="yellow" title="Worker de sincronización deshabilitado">
          Hay credenciales de Twilio, pero `WHATSAPP_MESSAGE_COST_SYNC_WORKER_ENABLED` está en
          false. Los costos pendientes no se actualizarán solos.
        </Alert>
      ) : null}

      {summary && summary.workerOperationalStatus === "WORKER_STALE" ? (
        <Alert color="orange" title="Worker sin ejecución reciente">
          El worker está habilitado, pero no hay una corrida reciente. Última ejecución:{" "}
          {summary.lastWorkerRunAt ? formatDateTime(summary.lastWorkerRunAt) : "nunca"}.
        </Alert>
      ) : null}

      {summary?.partiallySynced ? (
        <Alert color="blue" title="Sincronización parcial">
          Hay {summary.totals.pendingCount} mensajes pendientes de costo definitivo.
        </Alert>
      ) : null}

      {summary?.hasUnavailable ? (
        <Alert color="gray" title="Registros no disponibles">
          Hay {summary.totals.unavailableCount} mensajes sin costo recuperable (p. ej. TwiML sin
          SID o precio agotado en Twilio).
        </Alert>
      ) : null}

      {summary ? (
        <>
          <Text size="sm" c="dimmed">
            Zona contable: {summary.timezone}. Worker: {summary.workerOperationalStatus}. Última
            sync de filas: {summary.lastSyncedAt ? formatDateTime(summary.lastSyncedAt) : "—"}
          </Text>
          <Alert color="gray" title="Alcance del importe">
            {summary.billingScopeNote}
          </Alert>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <SectionCard title="Total mensajes">
              <Text fw={700} size="xl">
                {summary.totals.messageCount}
              </Text>
              <Text size="sm" c="dimmed">
                Entregados: {summary.totals.deliveredCount} · Leídos: {summary.totals.readCount} ·
                Fallidos: {summary.totals.failedCount}
              </Text>
            </SectionCard>
            <SectionCard title="Pendientes">
              <Text fw={700} size="xl">
                {summary.totals.pendingCount}
              </Text>
              <Text size="sm" c="dimmed">
                Sin moneda: {summary.totals.pendingWithoutCurrencyCount}
              </Text>
            </SectionCard>
            <SectionCard title="No disponibles">
              <Text fw={700} size="xl">
                {summary.totals.unavailableCount}
              </Text>
              <Text size="sm" c="dimmed">
                Sin costo recuperable
              </Text>
            </SectionCard>
            <SectionCard title="Confirmados / estimados">
              <Text fw={700} size="xl">
                {summary.totals.confirmedCount} / {summary.totals.estimatedCount}
              </Text>
              <Text size="sm" c="dimmed">
                Conteos globales (importes por moneda abajo)
              </Text>
            </SectionCard>
          </SimpleGrid>

          {summary.byCurrency.length === 0 ? (
            <Alert color="gray" title="Sin resultados">
              No hay mensajes de costo para el período y filtros seleccionados.
            </Alert>
          ) : null}

          {summary.byCurrency.map((currencyRow) => (
            <SectionCard
              key={currencyRow.currency ?? "UNK"}
              title={`Importes · ${currencyRow.currency ?? "sin moneda"}`}
            >
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <div>
                  <Text size="sm" c="dimmed">
                    Confirmado ({currencyRow.confirmedCount} msgs)
                  </Text>
                  <Text fw={700} size="lg">
                    {formatMoney(currencyRow.confirmedTotal, currencyRow.currency)}
                  </Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">
                    Estimado ({currencyRow.estimatedCount} msgs)
                  </Text>
                  <Text fw={700} size="lg">
                    {formatMoney(currencyRow.estimatedTotal, currencyRow.currency)}
                  </Text>
                </div>
              </SimpleGrid>
              <Text size="sm" c="dimmed" mt="xs">
                Mensajes en esta moneda: {currencyRow.messageCount} · Pendientes:{" "}
                {currencyRow.pendingCount} · No disponibles: {currencyRow.unavailableCount}
              </Text>
            </SectionCard>
          ))}
        </>
      ) : null}

      <SectionCard title="Desglose por empresa">
        {companyQuery.isLoading ? <LoadingState /> : null}
        {companyQuery.isError ? (
          <ErrorState message={getApiErrorMessage(companyQuery.error)} />
        ) : null}
        {companyQuery.data ? (
          <DataTable
            columns={companyColumns}
            rows={companyQuery.data.items}
            getRowKey={(row) => `${row.companyId ?? "none"}-${row.currency ?? "unk"}`}
            emptyTitle="Sin datos"
            emptyDescription="Sin datos para el período"
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Desglose por plantilla / tipo">
        {templateQuery.isLoading ? <LoadingState /> : null}
        {templateQuery.isError ? (
          <ErrorState message={getApiErrorMessage(templateQuery.error)} />
        ) : null}
        {templateQuery.data ? (
          <DataTable
            columns={templateColumns}
            rows={templateQuery.data.items}
            getRowKey={(row) =>
              `${row.messageKind}-${row.templateSid ?? "none"}-${row.flowLabel ?? ""}-${row.currency ?? "unk"}-${row.messageCount}`
            }
            emptyTitle="Sin datos"
            emptyDescription="Sin datos para el período"
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Detalle">
        {detailQuery.isLoading ? <LoadingState /> : null}
        {detailQuery.isError ? (
          <ErrorState message={getApiErrorMessage(detailQuery.error)} />
        ) : null}
        {detailQuery.data ? (
          <>
            <DataTable
              columns={detailColumns}
              rows={detailQuery.data.data}
              getRowKey={(row) => row.id}
              emptyTitle="Sin mensajes"
              emptyDescription="Sin mensajes en el período"
            />
            <PaginationControls
              meta={mapApiPaginationMeta(detailQuery.data.meta)}
              onPageChange={(nextPage) => setPage(nextPage)}
            />
          </>
        ) : null}
      </SectionCard>

      {resyncMutation.isSuccess ? (
        <Alert color="green" title="Re-sincronización solicitada">
          Se marcaron {resyncMutation.data.updated} registros para nueva sincronización.
        </Alert>
      ) : null}
      {resyncMutation.isError ? (
        <ErrorState message={getApiErrorMessage(resyncMutation.error)} />
      ) : null}

      <Text size="xs" c="dimmed">
        Ruta: {COSTS_PATH}
      </Text>
    </Stack>
  );
}
