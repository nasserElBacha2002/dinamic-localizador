import { Button, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { MainLayout } from "../layouts/MainLayout";

export function NotFoundPage() {
  return (
    <MainLayout>
      <Stack spacing={2}>
        <Typography variant="h4">404</Typography>
        <Typography>La pagina solicitada no existe.</Typography>
        <Button component={RouterLink} to="/" variant="outlined">
          Volver al inicio
        </Button>
      </Stack>
    </MainLayout>
  );
}
