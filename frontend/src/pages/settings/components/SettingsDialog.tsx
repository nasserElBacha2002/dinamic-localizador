import { Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { FormErrorAlert } from "../../../design-system";
import classes from "../settings-visual.module.css";
import { SettingsResponsiveModal } from "./SettingsResponsiveModal";

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
    <SettingsResponsiveModal
      opened={opened}
      onClose={onClose}
      title={title}
      size={size}
      bodyMode="scroll"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      footer={
        <Group
          justify="flex-end"
          gap="sm"
          style={{ borderTop: "1px solid var(--mantine-color-gray-3)", paddingTop: "var(--mantine-spacing-sm)" }}
        >
          <Button variant="default" size="md" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="md"
            color="accent"
            onClick={() => void onSave()}
            loading={saving}
            disabled={saveDisabled || saving}
          >
            {saveLabel}
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        {subtitle ? (
          <Text size="sm" className={classes.dialogSubtitle}>
            {subtitle}
          </Text>
        ) : null}

        {children}

        <FormErrorAlert message={submitError} />
      </Stack>
    </SettingsResponsiveModal>
  );
}
