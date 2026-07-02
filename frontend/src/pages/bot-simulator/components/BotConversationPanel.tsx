import { Badge, Box, Button, Group, Paper, Text, TextInput } from "@mantine/core";
import type { BotSimulatorSessionState } from "../hooks/useBotSimulatorSession";
import { BADGE_LABELS } from "../types";
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
    <Paper withBorder radius="md" p="md" style={{ minHeight: 480, display: "flex", flexDirection: "column" }}>
      <Group gap="xs" mb="md">
        {sessionState?.statusBadges.map((badge) => (
          <Badge key={badge} variant="light">
            {BADGE_LABELS[badge] ?? badge}
          </Badge>
        ))}
      </Group>

      {!sessionState ? (
        <Box style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <Text c="dimmed">Configurá el contexto y presioná &quot;Iniciar simulación&quot; para comenzar.</Text>
        </Box>
      ) : (
        <>
          <Box
            style={{
              flex: 1,
              overflowY: "auto",
              maxHeight: 420,
              marginBottom: 16,
              paddingRight: 8,
              backgroundColor: "var(--mantine-color-gray-0)",
              borderRadius: "var(--mantine-radius-sm)",
              padding: 16,
            }}
          >
            {sessionState.messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            <div ref={chatEndRef} />
          </Box>

          <Group gap="xs" mb="md">
            <Button size="xs" variant="default" disabled={isBusy} onClick={() => void handleSendText("Llegué")}>
              Enviar &quot;Llegué&quot;
            </Button>
            <Button size="xs" variant="default" disabled={isBusy} onClick={() => void handleSendText("Terminé")}>
              Enviar &quot;Terminé&quot;
            </Button>
            <Button size="xs" variant="default" disabled={isBusy} onClick={() => void handleSendText("Hola")}>
              Enviar &quot;Hola&quot;
            </Button>
            <Button size="xs" variant="default" disabled={isBusy} onClick={() => void handleSendText("Menú")}>
              Enviar &quot;Menú&quot;
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={isBusy || !locationPresets?.storeLocation}
              onClick={() => {
                if (locationPresets?.storeLocation) {
                  void handleSendLocation(
                    locationPresets.storeLocation.latitude,
                    locationPresets.storeLocation.longitude,
                  );
                }
              }}
            >
              Ubicación de tienda
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={isBusy || !locationPresets?.outsideRadius}
              onClick={() => {
                if (locationPresets?.outsideRadius) {
                  void handleSendLocation(
                    locationPresets.outsideRadius.latitude,
                    locationPresets.outsideRadius.longitude,
                  );
                }
              }}
            >
              Fuera del radio
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={isBusy || !locationPresets?.nearRadiusLimit}
              onClick={() => {
                if (locationPresets?.nearRadiusLimit) {
                  void handleSendLocation(
                    locationPresets.nearRadiusLimit.latitude,
                    locationPresets.nearRadiusLimit.longitude,
                  );
                }
              }}
            >
              Cerca del límite
            </Button>
            <Button size="xs" variant="default" disabled={isBusy} onClick={() => setLocationDialogOpen(true)}>
              Enviar ubicación
            </Button>
          </Group>

          <Group gap="sm" align="flex-end">
            <TextInput
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
            />
            <Button onClick={() => void handleSendText(draftText)} disabled={isBusy || !draftText.trim()}>
              Enviar
            </Button>
          </Group>
        </>
      )}
    </Paper>
  );
}
