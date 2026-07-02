import { Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title = "Sin resultados",
  description = "No hay datos para mostrar.",
  action,
}: EmptyStateProps) {
  return (
    <Paper withBorder radius="md" p="xl">
      <Stack align="center" gap="sm" ta="center">
        <Title order={4}>{title}</Title>
        {description ? (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        ) : null}
        {action ? <div>{action}</div> : null}
      </Stack>
    </Paper>
  );
}
