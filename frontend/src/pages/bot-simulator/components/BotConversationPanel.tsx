import { Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
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
    <Paper sx={{ p: 2, minHeight: 480, display: "flex", flexDirection: "column" }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {sessionState?.statusBadges.map((badge) => (
          <Chip key={badge} label={BADGE_LABELS[badge] ?? badge} size="small" color="primary" variant="outlined" />
        ))}
      </Stack>

      {!sessionState ? (
        <Box sx={{ flex: 1, display: "grid", placeItems: "center" }}>
          <Typography color="text.secondary">
            Configurá el contexto y presioná &quot;Iniciar simulación&quot; para comenzar.
          </Typography>
        </Box>
      ) : (
        <>
          <Box
            sx={{
              flex: 1,
              overflowY: "auto",
              maxHeight: 420,
              mb: 2,
              pr: 1,
              bgcolor: "grey.50",
              borderRadius: 1,
              p: 2,
            }}
          >
            {sessionState.messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            <div ref={chatEndRef} />
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Button size="small" variant="outlined" disabled={isBusy} onClick={() => void handleSendText("Llegué")}>
              Enviar &quot;Llegué&quot;
            </Button>
            <Button size="small" variant="outlined" disabled={isBusy} onClick={() => void handleSendText("Terminé")}>
              Enviar &quot;Terminé&quot;
            </Button>
            <Button size="small" variant="outlined" disabled={isBusy} onClick={() => void handleSendText("Hola")}>
              Enviar &quot;Hola&quot;
            </Button>
            <Button size="small" variant="outlined" disabled={isBusy} onClick={() => void handleSendText("Menú")}>
              Enviar &quot;Menú&quot;
            </Button>
            <Button
              size="small"
              variant="outlined"
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
              size="small"
              variant="outlined"
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
              size="small"
              variant="outlined"
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
            <Button size="small" variant="outlined" disabled={isBusy} onClick={() => setLocationDialogOpen(true)}>
              Enviar ubicación
            </Button>
          </Stack>

          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              placeholder="Escribí un mensaje..."
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendText(draftText);
                }
              }}
              disabled={isBusy}
            />
            <Button variant="contained" onClick={() => void handleSendText(draftText)} disabled={isBusy || !draftText.trim()}>
              Enviar
            </Button>
          </Stack>
        </>
      )}
    </Paper>
  );
}
