import { Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { useState } from "react";
import { ResponsiveModal } from "../../design-system";
import type { ReviewAttendanceInput } from "../../types/attendance";

interface ReviewAttendanceDialogProps {
  open: boolean;
  decision: "APPROVE" | "REJECT";
  loading?: boolean;
  onClose: () => void;
  onConfirm: (input: ReviewAttendanceInput) => Promise<void>;
}

export function ReviewAttendanceDialog({
  open,
  decision,
  loading = false,
  onClose,
  onConfirm,
}: ReviewAttendanceDialogProps) {
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClose = () => {
    setReason("");
    setErrorMessage(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setErrorMessage("El motivo es obligatorio.");
      return;
    }

    setErrorMessage(null);
    await onConfirm({ decision, reason: reason.trim() });
    setReason("");
  };

  return (
    <ResponsiveModal
      opened={open}
      onClose={loading ? () => undefined : handleClose}
      title={decision === "APPROVE" ? "Validación manual: aprobar" : "Validación manual: rechazar"}
      size="md"
      bodyMode="normal"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      footer={
        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Button variant="default" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            color={decision === "REJECT" ? "red" : undefined}
            onClick={() => void handleConfirm()}
            loading={loading}
          >
            {decision === "APPROVE" ? "Aprobar" : "Rechazar"}
          </Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {decision === "APPROVE"
            ? "Confirmá la asistencia pese a incidencias de ubicación o puntualidad. El motivo queda registrado para auditoría."
            : "Indicá por qué no se acepta el registro. El colaborador no verá este texto automáticamente en WhatsApp."}
        </Text>
        <Textarea
          label="Motivo"
          description="Obligatorio"
          required
          minRows={3}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          error={errorMessage ?? undefined}
          disabled={loading}
        />
      </Stack>
    </ResponsiveModal>
  );
}
