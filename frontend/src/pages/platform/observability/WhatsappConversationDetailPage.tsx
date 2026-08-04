import { Box, Button, Code, Group, Paper, ScrollArea, Stack, Tabs, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router";
import {
  DataTable,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
} from "../../../design-system";
import { useAuth } from "../../../hooks/useAuth";
import {
  useRevealWhatsappPhone,
  useWhatsappConversation,
  useWhatsappConversationMessagesInfinite,
  useWhatsappConversationProviderEvents,
  useWhatsappFlowExecution,
} from "../../../hooks/useWhatsappObservability";
import type {
  WhatsappFlowCandidate,
  WhatsappFlowExecutionSummary,
  WhatsappFlowStep,
  WhatsappObservabilityMessage,
  WhatsappProviderEvent,
} from "../../../types/whatsapp-observability";
import { formatDateTime } from "../../../utils/dates";
import { getApiErrorMessage, parseApiError } from "../../../utils/errors";
import { isWhatsappObservabilityUiEnabled } from "../../../utils/whatsapp-observability-config";
import {
  conversationStatusTone,
  flowExecutionStatusTone,
  flowStepStatusTone,
  whatsappConversationStatusLabels,
  whatsappFlowExecutionStatusLabels,
  whatsappFlowStepStatusLabels,
} from "./whatsapp-observability-labels";

const CHAT_MESSAGES_ERROR = "No se pudieron cargar los mensajes de la conversación.";

function logChatMessagesError(error: unknown): void {
  const parsed = parseApiError(error);
  console.error("[whatsapp-observability] conversation messages failed", {
    code: parsed.code,
    status: parsed.status,
  });
}

function ChatBubble({ message }: { message: WhatsappObservabilityMessage }) {
  const isInbound = message.direction === "INBOUND";
  const isLocation = message.messageType === "LOCATION";

  return (
    <Box
      mb="sm"
      style={{ display: "flex", justifyContent: isInbound ? "flex-start" : "flex-end" }}
    >
      <Paper
        shadow="xs"
        radius="md"
        p="sm"
        maw="85%"
        bg={isInbound ? "gray.1" : "blue.6"}
        c={isInbound ? "dark" : "white"}
      >
        {isLocation ? (
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Ubicación
            </Text>
            <Text size="xs">Lat: {message.latitude ?? "—"}</Text>
            <Text size="xs">Lng: {message.longitude ?? "—"}</Text>
          </Stack>
        ) : message.templateName ? (
          <Stack gap={4}>
            <Text size="xs" opacity={0.85}>
              Plantilla: {message.templateName}
            </Text>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {message.body ?? "—"}
            </Text>
          </Stack>
        ) : (
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {message.body ?? "—"}
          </Text>
        )}
        <Group gap="xs" mt={6} justify={isInbound ? "flex-start" : "flex-end"}>
          {message.providerStatus ? (
            <Text size="xs" opacity={0.75}>
              {message.providerStatus}
            </Text>
          ) : null}
          <Text size="xs" opacity={0.75}>
            {formatDateTime(message.createdAt)}
          </Text>
        </Group>
      </Paper>
    </Box>
  );
}

function FlowExecutionPanel({
  execution,
  selectedId,
  onSelect,
}: {
  execution: WhatsappFlowExecutionSummary;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{
        cursor: "pointer",
        borderColor: selectedId === execution.id ? "var(--mantine-color-blue-5)" : undefined,
      }}
      onClick={() => onSelect(execution.id)}
    >
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {execution.flowType}
          </Text>
          <Text size="xs" c="dimmed">
            {formatDateTime(execution.startedAt)}
          </Text>
        </Stack>
        <StatusBadge
          label={whatsappFlowExecutionStatusLabels[execution.status]}
          tone={flowExecutionStatusTone(execution.status)}
        />
      </Group>
      {execution.resultCode ? (
        <Text size="xs" mt="xs">
          Resultado: {execution.resultCode}
        </Text>
      ) : null}
      {execution.errorCode ? (
        <Text size="xs" c="red">
          Error: {execution.errorCode}
        </Text>
      ) : null}
    </Paper>
  );
}

function ConversationChatPanel({
  conversationId,
  enabled,
}: {
  conversationId: string | undefined;
  enabled: boolean;
}) {
  const messagesQuery = useWhatsappConversationMessagesInfinite(conversationId, enabled);
  const messages = messagesQuery.data?.messages ?? [];
  const hasOlder = messagesQuery.hasNextPage;
  const loadedCount = messagesQuery.data?.loadedCount ?? messages.length;
  const isInitialPending = messagesQuery.isPending;
  const isInitialError = messagesQuery.isError && messages.length === 0;

  useEffect(() => {
    if (messagesQuery.isError) {
      logChatMessagesError(messagesQuery.error);
    }
  }, [messagesQuery.isError, messagesQuery.error]);

  if (isInitialPending) {
    return <LoadingState />;
  }

  if (isInitialError) {
    return (
      <ErrorState
        title="No se pudieron cargar los mensajes"
        message={CHAT_MESSAGES_ERROR}
        action={
          <Button size="sm" variant="light" onClick={() => void messagesQuery.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <Stack gap="sm">
      {hasOlder ? (
        <Group justify="center">
          <Button
            size="xs"
            variant="default"
            loading={messagesQuery.isFetchingNextPage}
            onClick={() => void messagesQuery.fetchNextPage()}
          >
            Cargar mensajes anteriores
          </Button>
        </Group>
      ) : null}

      {messagesQuery.isFetchNextPageError ? (
        <ErrorState
          title="No se pudo ampliar el historial"
          message={CHAT_MESSAGES_ERROR}
          action={
            <Button size="sm" variant="light" onClick={() => void messagesQuery.fetchNextPage()}>
              Reintentar
            </Button>
          }
        />
      ) : null}

      <ScrollArea.Autosize mah={560} type="auto">
        {messages.length === 0 ? (
          <Text size="sm" c="dimmed">
            No hay mensajes registrados para esta conversación.
          </Text>
        ) : (
          messages.map((message) => <ChatBubble key={message.id} message={message} />)
        )}
      </ScrollArea.Autosize>

      {messages.length > 0 && hasOlder ? (
        <Text size="xs" c="dimmed" ta="center">
          Mostrando {loadedCount} mensajes cargados. Podés cargar mensajes anteriores.
        </Text>
      ) : null}

      {messages.length > 0 && !hasOlder ? (
        <Text size="xs" c="dimmed" ta="center">
          Fin del historial ({loadedCount} mensajes cargados).
        </Text>
      ) : null}
    </Stack>
  );
}

export function WhatsappConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const uiEnabled = isWhatsappObservabilityUiEnabled();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);

  const conversationQuery = useWhatsappConversation(conversationId, isPlatformAdmin && uiEnabled);
  const providerEventsQuery = useWhatsappConversationProviderEvents(
    conversationId,
    isPlatformAdmin && uiEnabled,
  );
  const revealMutation = useRevealWhatsappPhone(conversationId);

  const recentExecutions = conversationQuery.data?.recentExecutions ?? [];
  const activeFlowId = selectedFlowId ?? recentExecutions[0]?.id ?? null;
  const flowQuery = useWhatsappFlowExecution(activeFlowId, isPlatformAdmin && uiEnabled);

  const candidateColumns = useMemo<DataTableColumn<WhatsappFlowCandidate>[]>(
    () => [
      { key: "candidateType", header: "Tipo", getValue: (row) => row.candidateType },
      { key: "entityId", header: "Entidad", getValue: (row) => row.entityId ?? "—" },
      {
        key: "accepted",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={row.accepted ? "Aceptado" : "Rechazado"}
            tone={row.accepted ? "success" : "danger"}
          />
        ),
      },
      { key: "reasonCode", header: "Motivo", getValue: (row) => row.reasonCode ?? "—" },
      { key: "reasonDetail", header: "Detalle", getValue: (row) => row.reasonDetail ?? "—" },
    ],
    [],
  );

  const stepColumns = useMemo<DataTableColumn<WhatsappFlowStep>[]>(
    () => [
      { key: "sequence", header: "#", getValue: (row) => String(row.sequence) },
      { key: "stepName", header: "Paso", getValue: (row) => row.stepName },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={whatsappFlowStepStatusLabels[row.status]}
            tone={flowStepStatusTone(row.status)}
          />
        ),
      },
      { key: "reasonCode", header: "Motivo", getValue: (row) => row.reasonCode ?? "—" },
      {
        key: "durationMs",
        header: "Duración",
        getValue: (row) => (row.durationMs != null ? `${row.durationMs} ms` : "—"),
      },
    ],
    [],
  );

  const providerEventColumns = useMemo<DataTableColumn<WhatsappProviderEvent>[]>(
    () => [
      { key: "providerStatus", header: "Estado", getValue: (row) => row.providerStatus },
      { key: "eventType", header: "Evento", getValue: (row) => row.eventType },
      { key: "errorCode", header: "Error", getValue: (row) => row.errorCode ?? "—" },
      {
        key: "receivedAt",
        header: "Recibido",
        getValue: (row) => formatDateTime(row.receivedAt),
      },
    ],
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

  if (conversationQuery.isPending) {
    return <LoadingState />;
  }

  if (conversationQuery.isError || !conversationQuery.data) {
    return (
      <ErrorState
        message={getApiErrorMessage(conversationQuery.error) ?? "No se pudo cargar la conversación."}
      />
    );
  }

  const conversation = conversationQuery.data;
  const displayPhone = revealedPhone ?? conversation.phoneMasked;
  const providerEvents = providerEventsQuery.data ?? [];

  const handleRevealPhone = async () => {
    try {
      const result = await revealMutation.mutateAsync();
      setRevealedPhone(result.phoneNormalized);
    } catch {
      /* mutation error surfaced via button state if needed */
    }
  };

  return (
    <>
      <PageHeader
        title={`Conversación ${displayPhone}`}
        description="Detalle de mensajes, ejecuciones de flujo y eventos del proveedor."
        action={
          <Button component={RouterLink} to="/platform/observability/whatsapp" variant="default">
            Volver al listado
          </Button>
        }
      />

      <SectionCard title="Resumen">
        <DetailFieldGrid
          fields={[
            {
              label: "Estado",
              value: (
                <StatusBadge
                  label={whatsappConversationStatusLabels[conversation.status]}
                  tone={conversationStatusTone(conversation.status)}
                />
              ),
            },
            {
              label: "Teléfono",
              value: (
                <Group gap="xs">
                  <Text size="sm">{displayPhone}</Text>
                  {!revealedPhone ? (
                    <Button
                      size="xs"
                      variant="light"
                      loading={revealMutation.isPending}
                      onClick={() => void handleRevealPhone()}
                    >
                      Revelar
                    </Button>
                  ) : null}
                </Group>
              ),
            },
            { label: "Inicio", value: formatDateTime(conversation.startedAt) },
            { label: "Última actividad", value: formatDateTime(conversation.lastActivityAt) },
            { label: "Mensajes", value: String(conversation.messageCount) },
            { label: "Errores", value: String(conversation.errorCount) },
            { label: "Empresa", value: conversation.companyId ?? "—" },
            { label: "Empleado", value: conversation.employeeId ?? "—" },
            {
              label: "Último resultado",
              value: conversation.lastResultCode ?? "—",
            },
          ]}
        />
      </SectionCard>

      <Tabs defaultValue="chat" variant="outline" mt="md">
        <Tabs.List style={{ flexWrap: "wrap" }}>
          <Tabs.Tab value="chat">Chat</Tabs.Tab>
          <Tabs.Tab value="timeline">Ejecuciones</Tabs.Tab>
          <Tabs.Tab value="candidates">Candidatos</Tabs.Tab>
          <Tabs.Tab value="twilio">Twilio</Tabs.Tab>
          <Tabs.Tab value="technical">IDs técnicos</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="chat" pt="md">
          <SectionCard title="Mensajes" description="Entrantes a la izquierda, salientes a la derecha.">
            <ConversationChatPanel
              conversationId={conversationId}
              enabled={isPlatformAdmin && uiEnabled}
            />
          </SectionCard>
        </Tabs.Panel>

        <Tabs.Panel value="timeline" pt="md">
          <Group align="flex-start" grow preventGrowOverflow={false} wrap="wrap">
            <Box style={{ flex: 1, minWidth: 280 }}>
              <SectionCard title="Ejecuciones recientes">
              <Stack gap="sm">
                {recentExecutions.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No hay ejecuciones registradas.
                  </Text>
                ) : (
                  recentExecutions.map((execution) => (
                    <FlowExecutionPanel
                      key={execution.id}
                      execution={execution}
                      selectedId={activeFlowId}
                      onSelect={setSelectedFlowId}
                    />
                  ))
                )}
              </Stack>
            </SectionCard>
            </Box>

            <Box style={{ flex: 2, minWidth: 320 }}>
              <SectionCard title="Pasos del flujo">
              {flowQuery.isPending ? <LoadingState /> : null}
              {flowQuery.isError ? (
                <ErrorState message={getApiErrorMessage(flowQuery.error)} />
              ) : null}
              {flowQuery.data ? (
                <DataTable
                  rows={flowQuery.data.steps}
                  columns={stepColumns}
                  getRowKey={(row) => row.id}
                  emptyTitle="Sin pasos"
                  emptyDescription="Esta ejecución no tiene pasos registrados."
                  aria-label="Pasos de ejecución"
                />
              ) : null}
            </SectionCard>
            </Box>
          </Group>
        </Tabs.Panel>

        <Tabs.Panel value="candidates" pt="md">
          <SectionCard title="Candidatos evaluados">
            {flowQuery.isPending ? <LoadingState /> : null}
            {flowQuery.data ? (
              <DataTable
                rows={flowQuery.data.candidates}
                columns={candidateColumns}
                getRowKey={(row) => row.id}
                emptyTitle="Sin candidatos"
                emptyDescription="Seleccioná una ejecución con candidatos registrados."
                aria-label="Candidatos de flujo"
              />
            ) : (
              <Text size="sm" c="dimmed">
                Seleccioná una ejecución en la pestaña Ejecuciones para ver candidatos.
              </Text>
            )}
          </SectionCard>
        </Tabs.Panel>

        <Tabs.Panel value="twilio" pt="md">
          <SectionCard
            title="Eventos Twilio"
            description="Historial append-only de callbacks del proveedor para esta conversación."
          >
            {providerEventsQuery.isPending ? <LoadingState /> : null}
            {providerEventsQuery.isError ? (
              <ErrorState message={getApiErrorMessage(providerEventsQuery.error)} />
            ) : null}
            {!providerEventsQuery.isPending && !providerEventsQuery.isError ? (
              <DataTable
                rows={providerEvents}
                columns={providerEventColumns}
                getRowKey={(row) => row.id}
                emptyTitle="Sin eventos"
                emptyDescription="No hay callbacks de Twilio registrados para esta conversación."
                aria-label="Eventos Twilio de la conversación"
              />
            ) : null}
          </SectionCard>
        </Tabs.Panel>

        <Tabs.Panel value="technical" pt="md">
          <SectionCard title="Identificadores técnicos">
            <DetailFieldGrid
              fields={[
                { label: "Conversation ID", value: conversation.id },
                { label: "Phone hash", value: conversation.phoneHash },
                { label: "Company ID", value: conversation.companyId ?? "—" },
                { label: "Employee ID", value: conversation.employeeId ?? "—" },
                {
                  label: "Flow execution activa",
                  value: activeFlowId ?? "—",
                },
              ]}
            />
            {flowQuery.data?.metadataJson ? (
              <Stack gap="xs" mt="md">
                <Text size="sm" fw={600}>
                  Metadata de ejecución
                </Text>
                <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {flowQuery.data.metadataJson}
                </Code>
              </Stack>
            ) : null}
          </SectionCard>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
