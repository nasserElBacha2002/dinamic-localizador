import { Button, Card, Group, Skeleton, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { ErrorState } from "../../../design-system";

export interface SettingsSummaryItem {
  label: string;
  value: ReactNode;
}

export interface SettingsSummaryCardProps {
  title: string;
  description?: string;
  summaryItems: SettingsSummaryItem[];
  chips?: string[];
  actionLabel?: string;
  onAction?: () => void;
  canEdit?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  footer?: ReactNode;
}

export function SettingsSummaryCard({
  title,
  description,
  summaryItems,
  chips = [],
  actionLabel = "Editar",
  onAction,
  canEdit = true,
  loading = false,
  error = null,
  onRetry,
  footer,
}: SettingsSummaryCardProps) {
  if (loading) {
    return (
      <Card withBorder padding="lg" radius="md" h="100%">
        <Stack gap="sm">
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="70%" />
          <Skeleton height={32} width={100} mt="sm" />
        </Stack>
      </Card>
    );
  }

  if (error) {
    return (
      <Card withBorder padding="lg" radius="md" h="100%">
        <Stack gap="sm">
          <Title order={4}>{title}</Title>
          <ErrorState message={error} />
          {onRetry ? (
            <Button variant="light" size="xs" onClick={onRetry}>
              Reintentar
            </Button>
          ) : null}
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder padding="lg" radius="md" h="100%">
      <Stack gap="md" justify="space-between" h="100%">
        <Stack gap="sm">
          <Stack gap={4}>
            <Title order={4}>{title}</Title>
            {description ? (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Stack>

          <Stack gap={6}>
            {summaryItems.map((item) => (
              <Group key={item.label} gap="xs" wrap="nowrap" align="flex-start">
                <Text size="sm" c="dimmed" style={{ minWidth: 120 }}>
                  {item.label}
                </Text>
                <Text size="sm" fw={500} style={{ flex: 1 }}>
                  {item.value}
                </Text>
              </Group>
            ))}
          </Stack>

          {chips.length > 0 ? (
            <Group gap={6}>
              {chips.map((chip) => (
                <Text
                  key={chip}
                  size="xs"
                  px={8}
                  py={4}
                  style={{
                    borderRadius: 999,
                    background: "var(--mantine-color-gray-1)",
                  }}
                >
                  {chip}
                </Text>
              ))}
            </Group>
          ) : null}

          {footer}
        </Stack>

        {canEdit && onAction ? (
          <Group>
            <Button variant="light" onClick={onAction}>
              {actionLabel}
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Card>
  );
}
