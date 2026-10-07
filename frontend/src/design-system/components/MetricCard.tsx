import { Card, Group, Skeleton, Stack, Text, UnstyledButton } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./metric-card.module.css";

export interface MetricCardProps {
  title: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  trend?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
  /** Mantine color for the value (semantic tones only; default structural ink). */
  valueColor?: string;
  "aria-label"?: string;
}

export function MetricCard({
  title,
  value,
  description,
  trend,
  icon,
  loading = false,
  onClick,
  valueColor,
  "aria-label": ariaLabel,
}: MetricCardProps) {
  if (loading) {
    return (
      <Card withBorder padding="lg" radius="md" className={classes.card}>
        <Stack gap="sm">
          <Skeleton height={14} width="60%" />
          <Skeleton height={28} width="40%" />
          <Skeleton height={12} width="80%" />
        </Stack>
      </Card>
    );
  }

  const content = (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="sm" className={classes.title}>
          {title}
        </Text>
        {icon ? <div>{icon}</div> : null}
      </Group>
      <Text size="xl" className={classes.value} c={valueColor ?? "brand.7"}>
        {value}
      </Text>
      {description ? (
        <Text size="sm" className={classes.description}>
          {description}
        </Text>
      ) : null}
      {trend ? <div>{trend}</div> : null}
    </Stack>
  );

  if (onClick) {
    return (
      <UnstyledButton
        onClick={onClick}
        aria-label={ariaLabel}
        style={{ display: "block", width: "100%", textAlign: "left" }}
      >
        <Card
          withBorder
          padding="lg"
          radius="md"
          className={`${classes.card} ${classes.cardInteractive}`}
          style={{ cursor: "pointer" }}
        >
          {content}
        </Card>
      </UnstyledButton>
    );
  }

  return (
    <Card withBorder padding="lg" radius="md" className={classes.card}>
      {content}
    </Card>
  );
}
