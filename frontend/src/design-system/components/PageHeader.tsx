import { Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
}

export function PageHeader({ title, description, action, breadcrumb }: PageHeaderProps) {
  return (
    <Stack gap="sm" mb="lg">
      {breadcrumb ? <div>{breadcrumb}</div> : null}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Title order={2}>{title}</Title>
          {description ? (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          ) : null}
        </Stack>
        {action ? (
          <Group gap="sm" wrap="wrap" style={{ flexShrink: 0 }}>
            {action}
          </Group>
        ) : null}
      </Group>
    </Stack>
  );
}
