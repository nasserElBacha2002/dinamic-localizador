import { Button, Stack } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

interface FormActionsProps {
  submitLabel: string;
  cancelTo: string;
  loading?: boolean;
}

export function FormActions({ submitLabel, cancelTo, loading = false }: FormActionsProps) {
  return (
    <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
      <Button type="submit" variant="contained" disabled={loading}>
        {submitLabel}
      </Button>
      <Button component={RouterLink} to={cancelTo} disabled={loading}>
        Cancelar
      </Button>
    </Stack>
  );
}
