import { Box, Stack, Text } from "@mantine/core";
import type { BotSimulatorMessage } from "../../../api/bot-simulator.api";
import { formatDateTime } from "../../../utils/dates";
import classes from "./chat-bubble.module.css";

export function ChatBubble({ message }: { message: BotSimulatorMessage }) {
  const isUser = message.direction === "INBOUND";
  const isLocation = message.messageType === "LOCATION";

  return (
    <Box
      mb="sm"
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        className={`${classes.bubble} ${isUser ? classes.outbound : classes.inbound}`}
      >
        {isLocation ? (
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Ubicación enviada
            </Text>
            <Text size="xs">Lat: {message.latitude}</Text>
            <Text size="xs">Lng: {message.longitude}</Text>
          </Stack>
        ) : (
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {message.body}
          </Text>
        )}
        <div
          className={`${classes.timestamp} ${
            isUser ? classes.timestampOutbound : classes.timestampInbound
          }`}
        >
          {formatDateTime(message.createdAt)}
        </div>
      </div>
    </Box>
  );
}
