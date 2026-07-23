import { Button, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { ResponsiveModal } from "./ResponsiveModal";

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  loading = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ResponsiveModal
      opened={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      size="md"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      footer={
        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Button variant="default" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            color={destructive ? "danger" : "brand"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </Group>
      }
    >
      {description ? (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      ) : null}
    </ResponsiveModal>
  );
}
