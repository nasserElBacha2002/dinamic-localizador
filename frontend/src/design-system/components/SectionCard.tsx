import { Card, Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionCard({ title, description, action, children }: SectionCardProps) {
  return (
    <Card withBorder padding="lg" radius="md">
      {title || description || action ? (
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md" mb="md">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            {title ? <Title order={4}>{title}</Title> : null}
            {description ? (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Stack>
          {action ? <Group gap="sm">{action}</Group> : null}
        </Group>
      ) : null}
      {children}
    </Card>
  );
}
