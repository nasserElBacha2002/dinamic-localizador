import { Button, Group, Modal, Text } from "@mantine/core";
import type { ReactNode } from "react";

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
    <Modal
      opened={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      centered
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      {description ? (
        <Text size="sm" c="dimmed" mb="lg">
          {description}
        </Text>
      ) : null}
      <Group justify="flex-end" gap="sm">
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
    </Modal>
  );
}
