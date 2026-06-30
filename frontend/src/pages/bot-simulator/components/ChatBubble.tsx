import { Box, Paper, Stack, Typography } from "@mui/material";
import type { BotSimulatorMessage } from "../../../api/bot-simulator.api";
import { formatDateTime } from "../../../utils/dates";

export function ChatBubble({ message }: { message: BotSimulatorMessage }) {
  const isUser = message.direction === "INBOUND";
  const isLocation = message.messageType === "LOCATION";

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 1.5,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: "85%",
          px: 2,
          py: 1.25,
          borderRadius: 2,
          bgcolor: isUser ? "primary.main" : "grey.100",
          color: isUser ? "primary.contrastText" : "text.primary",
        }}
      >
        {isLocation ? (
          <Stack spacing={0.5}>
            <Typography variant="body2" fontWeight={600}>
              📍 Ubicación enviada
            </Typography>
            <Typography variant="caption" component="div">
              Lat: {message.latitude}
            </Typography>
            <Typography variant="caption" component="div">
              Lng: {message.longitude}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {message.body}
          </Typography>
        )}
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 0.5, opacity: 0.75, textAlign: isUser ? "right" : "left" }}
        >
          {formatDateTime(message.createdAt)}
        </Typography>
      </Paper>
    </Box>
  );
}
