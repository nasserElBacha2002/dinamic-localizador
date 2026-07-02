import { Card, Group, Skeleton, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface MetricCardProps {
  title: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  trend?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
}

export function MetricCard({
  title,
  value,
  description,
  trend,
  icon,
  loading = false,
}: MetricCardProps) {
  if (loading) {
    return (
      <Card withBorder padding="lg" radius="md">
        <Stack gap="sm">
          <Skeleton height={14} width="60%" />
          <Skeleton height={28} width="40%" />
          <Skeleton height={12} width="80%" />
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text size="sm" c="dimmed" fw={500}>
            {title}
          </Text>
          {icon ? <div>{icon}</div> : null}
        </Group>
        <Text size="xl" fw={700}>
          {value}
        </Text>
        {description ? (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        ) : null}
        {trend ? <div>{trend}</div> : null}
      </Stack>
    </Card>
  );
}
