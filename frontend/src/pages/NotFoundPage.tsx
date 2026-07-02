import { Button, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

export function NotFoundPage() {
  return (
    <Stack spacing={2} alignItems="flex-start">
        <Typography variant="h4" component="h1">
          Página no encontrada
        </Typography>
        <Typography color="text.secondary">
          La ruta solicitada no existe en el panel administrativo.
        </Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Volver al inicio
        </Button>
      </Stack>
  );
}
