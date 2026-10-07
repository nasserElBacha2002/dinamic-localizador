import { Button, Group, ScrollArea, Stack, Textarea } from "@mantine/core";
import { EmptyState, SectionCard, StatusBadge } from "../../../design-system";
import type { BotSimulatorSessionState } from "../hooks/useBotSimulatorSession";
import { BADGE_LABELS } from "../types";
import { BotQuickActions } from "./BotQuickActions";
import { ChatBubble } from "./ChatBubble";

type BotConversationPanelProps = Pick<
  BotSimulatorSessionState,
  | "sessionState"
  | "chatEndRef"
  | "locationPresets"
  | "isBusy"
  | "draftText"
  | "setDraftText"
  | "handleSendText"
  | "handleSendLocation"
  | "setLocationDialogOpen"
>;

export function BotConversationPanel({
  sessionState,
  chatEndRef,
  locationPresets,
  isBusy,
  draftText,
  setDraftText,
  handleSendText,
  handleSendLocation,
  setLocationDialogOpen,
}: BotConversationPanelProps) {
  return (
    <SectionCard
      title="Conversación"
      description="Simulá el intercambio de mensajes como en WhatsApp."
      action={
        sessionState ? (
          <Group gap="xs">
            {sessionState.statusBadges.map((badge) => (
              <StatusBadge
                key={badge}
                label={BADGE_LABELS[badge] ?? badge}
                tone="info"
                variant="light"
              />
            ))}
          </Group>
        ) : undefined
      }
    >
      {!sessionState ? (
        <EmptyState
          title="Sin conversación activa"
          description='Configurá el contexto y presioná "Iniciar simulación" para comenzar.'
        />
      ) : (
        <Stack
          gap="md"
          style={{
            height: "min(70vh, 640px)",
            minHeight: 420,
            overflow: "hidden",
          }}
        >
          <ScrollArea
            type="auto"
            offsetScrollbars
            style={{
              flex: 1,
              minHeight: 0,
              backgroundColor: "var(--mantine-color-gray-0)",
              borderRadius: "var(--mantine-radius-sm)",
            }}
            p="sm"
          >
            {sessionState.messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            <div ref={chatEndRef} />
          </ScrollArea>

          <BotQuickActions
            isBusy={isBusy}
            locationPresets={locationPresets}
            onSendText={(text) => void handleSendText(text)}
            onSendLocation={(latitude, longitude) => void handleSendLocation(latitude, longitude)}
            onOpenLocationDialog={() => setLocationDialogOpen(true)}
          />

          <Group gap="sm" align="flex-end" wrap="nowrap">
            <Textarea
              style={{ flex: 1 }}
              placeholder="Escribí un mensaje..."
              value={draftText}
              onChange={(event) => setDraftText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendText(draftText);
                }
              }}
              disabled={isBusy}
              autosize
              minRows={1}
              maxRows={4}
            />
            <Button onClick={() => void handleSendText(draftText)} disabled={isBusy || !draftText.trim()}>
              Enviar
            </Button>
          </Group>
        </Stack>
      )}
    </SectionCard>
  );
}
