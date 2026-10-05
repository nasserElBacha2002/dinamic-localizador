import { Card, Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** When true, card fills parent flex height and body grows (dashboard rows). */
  fillHeight?: boolean;
}

export function SectionCard({
  title,
  description,
  action,
  children,
  fillHeight = false,
}: SectionCardProps) {
  return (
    <Card
      withBorder
      padding="lg"
      radius="md"
      h={fillHeight ? "100%" : undefined}
      style={
        fillHeight
          ? { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }
          : undefined
      }
    >
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
      {fillHeight ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </Card>
  );
}
