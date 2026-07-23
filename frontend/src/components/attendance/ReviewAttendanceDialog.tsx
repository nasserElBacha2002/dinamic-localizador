import { Button, Group, Textarea } from "@mantine/core";
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
      title={decision === "APPROVE" ? "Aprobar asistencia" : "Rechazar asistencia"}
      size="md"
      bodyMode="normal"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      footer={
        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Button variant="default" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} loading={loading}>
            Confirmar
          </Button>
        </Group>
      }
    >
      <Textarea
        label="Motivo"
        required
        minRows={3}
        value={reason}
        onChange={(event) => setReason(event.currentTarget.value)}
        error={errorMessage ?? undefined}
        disabled={loading}
      />
    </ResponsiveModal>
  );
}
