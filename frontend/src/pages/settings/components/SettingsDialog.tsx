import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { FormErrorAlert } from "../../../design-system";

export interface SettingsDialogProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onSave: () => void | Promise<void>;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  submitError?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}

export function SettingsDialog({
  opened,
  onClose,
  title,
  subtitle,
  children,
  onSave,
  saving = false,
  saveDisabled = false,
  saveLabel = "Guardar",
  submitError = null,
  size = "md",
}: SettingsDialogProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size={size}
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <Stack gap="md">
        {subtitle ? (
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        ) : null}

        {children}

        <FormErrorAlert message={submitError} />

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void onSave()} loading={saving} disabled={saveDisabled || saving}>
            {saveLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
