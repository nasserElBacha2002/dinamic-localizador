import { Alert, Paper, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface ErrorStateProps {
  title?: ReactNode;
  message?: ReactNode;
  action?: ReactNode;
}

export function ErrorState({
  title = "Ocurrió un error",
  message = "No se pudo cargar la información.",
  action,
}: ErrorStateProps) {
  return (
    <Paper withBorder radius="md" p="lg">
      <Stack gap="sm">
        <Alert color="danger" variant="light" title={title}>
          {message ? <Text size="sm">{message}</Text> : null}
        </Alert>
        {action ? <div>{action}</div> : null}
      </Stack>
    </Paper>
  );
}
