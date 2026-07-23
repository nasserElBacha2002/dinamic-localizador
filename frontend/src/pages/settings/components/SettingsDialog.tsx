import { Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { FormErrorAlert, ResponsiveModal } from "../../../design-system";

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
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title={title}
      size={size}
      bodyMode="scroll"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      footer={
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void onSave()} loading={saving} disabled={saveDisabled || saving}>
            {saveLabel}
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        {subtitle ? (
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        ) : null}

        {children}

        <FormErrorAlert message={submitError} />
      </Stack>
    </ResponsiveModal>
  );
}
