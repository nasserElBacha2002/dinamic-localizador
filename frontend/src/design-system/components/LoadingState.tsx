import { Center, Loader, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface LoadingStateProps {
  message?: ReactNode;
  height?: number | string;
}

export function LoadingState({ message = "Cargando...", height = 240 }: LoadingStateProps) {
  return (
    <Center style={{ minHeight: height }}>
      <Stack align="center" gap="sm">
        <Loader aria-label={typeof message === "string" ? message : "Cargando"} />
        {message ? (
          <Text size="sm" c="dimmed">
            {message}
          </Text>
        ) : null}
      </Stack>
    </Center>
  );
}
