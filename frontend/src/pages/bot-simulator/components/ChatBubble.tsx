import { Box, Paper, Stack, Text } from "@mantine/core";
import type { BotSimulatorMessage } from "../../../api/bot-simulator.api";
import { formatDateTime } from "../../../utils/dates";

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
      <Paper
        shadow="xs"
        radius="md"
        p="sm"
        maw="85%"
        bg={isUser ? "blue.6" : "gray.1"}
        c={isUser ? "white" : "dark"}
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
        <Text
          size="xs"
          mt={6}
          opacity={0.75}
          ta={isUser ? "right" : "left"}
          c={isUser ? "white" : "dimmed"}
        >
          {formatDateTime(message.createdAt)}
        </Text>
      </Paper>
    </Box>
  );
}
