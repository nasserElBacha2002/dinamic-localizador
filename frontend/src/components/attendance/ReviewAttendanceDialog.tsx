import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
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
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {decision === "APPROVE" ? "Aprobar asistencia" : "Rechazar asistencia"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Motivo"
            required
            fullWidth
            multiline
            minRows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={Boolean(errorMessage)}
            helperText={errorMessage}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={loading}>
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
