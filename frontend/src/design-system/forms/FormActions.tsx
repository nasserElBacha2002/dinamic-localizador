import { Button, Group } from "@mantine/core";
import { Link as RouterLink } from "react-router-dom";

export interface FormActionsProps {
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onCancel?: () => void;
  cancelTo?: string;
  cancelState?: unknown;
  align?: "left" | "right";
}

export function FormActions({
  submitLabel = "Guardar cambios",
  cancelLabel = "Cancelar",
  loading = false,
  disabled = false,
  onCancel,
  cancelTo,
  cancelState,
  align = "left",
}: FormActionsProps) {
  const isDisabled = loading || disabled;

  return (
    <Group justify={align === "right" ? "flex-end" : "flex-start"} gap="sm" mt="md">
      <Button type="submit" loading={loading} disabled={isDisabled}>
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button variant="default" disabled={isDisabled} onClick={onCancel}>
          {cancelLabel}
        </Button>
      ) : cancelTo ? (
        <Button
          component={RouterLink}
          to={cancelTo}
          state={cancelState}
          variant="default"
          disabled={isDisabled}
        >
          {cancelLabel}
        </Button>
      ) : null}
    </Group>
  );
}
