import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./AiSuggestionCard.module.css";

export interface AiSuggestionCardProps {
  /** Main heading, e.g. "✨ Sugerencia de IA" */
  title: string;
  /** Affinity label such as "82% de afinidad"; omit when stale/unavailable */
  scoreLabel?: string | null;
  children?: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  loadingMessage?: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Soft empty/hidden — callers usually skip render instead */
  emptyMessage?: string | null;
  footer?: ReactNode;
}

/**
 * Presentational AI suggestion shell (violet identity).
 * No recommendation/assignment logic.
 */
export function AiSuggestionCard({
  title,
  scoreLabel,
  children,
  actions,
  loading = false,
  loadingMessage = "✨ Buscando una sugerencia...",
  errorMessage,
  onRetry,
  emptyMessage,
  footer,
}: AiSuggestionCardProps) {
  if (loading) {
    return (
      <div className={classes.aiCard} role="status" aria-live="polite" aria-busy="true">
        <Text size="sm" className={classes.aiTitle}>
          {loadingMessage}
        </Text>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className={classes.aiCard} role="alert">
        <Stack gap="xs">
          <Text size="sm" className={classes.aiTitle}>
            {title}
          </Text>
          <Text size="sm" c="dimmed">
            {errorMessage}
          </Text>
          {onRetry ? (
            <Button size="xs" variant="subtle" color="ai" onClick={onRetry} className={classes.aiRetry}>
              Reintentar
            </Button>
          ) : null}
        </Stack>
      </div>
    );
  }

  if (emptyMessage) {
    return (
      <Text size="xs" c="dimmed" role="status">
        {emptyMessage}
      </Text>
    );
  }

  return (
    <div className={classes.aiCard} role="region" aria-label={title}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" className={classes.aiTitle}>
              {title}
            </Text>
            <Badge color="ai" variant="light" size="sm">
              IA
            </Badge>
          </Group>
          {scoreLabel ? (
            <Badge color="ai" variant="light" size="lg" aria-label={scoreLabel}>
              {scoreLabel}
            </Badge>
          ) : null}
        </Group>

        {children}

        {actions ? (
          <Group gap="xs" wrap="wrap">
            {actions}
          </Group>
        ) : null}

        {footer}
      </Stack>
    </div>
  );
}

/** Compact notice when the applied team matches the last suggestion. */
export function AiSuggestionAppliedNotice({ onOtherOption }: { onOtherOption?: () => void }) {
  return (
    <Alert color="ai" variant="light" title="✨ Equipo aplicado" role="status">
      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
        <Text size="sm">Podés ajustar el formulario o pedir otra opción.</Text>
        {onOtherOption ? (
          <Button size="xs" variant="light" color="ai" onClick={onOtherOption}>
            Otra opción
          </Button>
        ) : null}
      </Group>
    </Alert>
  );
}
