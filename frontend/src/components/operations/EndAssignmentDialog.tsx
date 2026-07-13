import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { validateEndAssignmentEffectiveDate } from "./end-assignment-form";

interface EndAssignmentDialogProps {
  open: boolean;
  employeeName: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (effectiveDate: string) => Promise<void>;
}

export function EndAssignmentDialog({
  open,
  employeeName,
  loading = false,
  onClose,
  onConfirm,
}: EndAssignmentDialogProps) {
  const [effectiveDate, setEffectiveDate] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClose = () => {
    setEffectiveDate("");
    setErrorMessage(null);
    onClose();
  };

  const handleConfirm = async () => {
    const validation = validateEndAssignmentEffectiveDate(effectiveDate);
    if (validation.valid === false) {
      setErrorMessage(validation.message);
      return;
    }

    setErrorMessage(null);

    try {
      await onConfirm(effectiveDate);
      setEffectiveDate("");
    } catch {
      // Parent handles feedback; preserve dialog input on validation errors.
    }
  };

  return (
    <Modal
      opened={open}
      onClose={handleClose}
      title="Finalizar asignación"
      centered
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="md">
        <Text size="sm">
          {employeeName} dejará de estar asignado a esta operación a partir de la fecha indicada.
        </Text>
        <Stack gap={4}>
          <Text component="label" htmlFor="end-assignment-effective-date" size="sm" fw={500}>
            Fecha efectiva
          </Text>
          <input
            id="end-assignment-effective-date"
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.currentTarget.value)}
            disabled={loading}
            style={{
              border: errorMessage
                ? "1px solid var(--mantine-color-red-6)"
                : "1px solid var(--mantine-color-gray-4)",
              borderRadius: "var(--mantine-radius-sm)",
              padding: "8px 12px",
              fontSize: "var(--mantine-font-size-sm)",
            }}
          />
          {errorMessage ? (
            <Text size="xs" c="red">
              {errorMessage}
            </Text>
          ) : null}
        </Stack>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} loading={loading} disabled={loading}>
            Finalizar asignación
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
