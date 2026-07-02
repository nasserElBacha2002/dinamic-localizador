import { Button, Group, Modal, Stack, Textarea } from "@mantine/core";
import { useState } from "react";
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
    <Modal
      opened={open}
      onClose={handleClose}
      title={decision === "APPROVE" ? "Aprobar asistencia" : "Rechazar asistencia"}
      centered
    >
      <Stack gap="md">
        <Textarea
          label="Motivo"
          required
          minRows={3}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          error={errorMessage ?? undefined}
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} loading={loading}>
            Confirmar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
