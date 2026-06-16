import { Button, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { MainLayout } from "../layouts/MainLayout";

export function HomePage() {
  return (
    <MainLayout>
      <Stack spacing={2}>
        <Typography variant="h4">Dinamic Attendance</Typography>
        <Typography variant="body1">
          Sistema interno de control de asistencia para inventarios.
        </Typography>
        <Typography variant="body1" color="success.main">
          Frontend operativo.
        </Typography>
        <Button component={RouterLink} to="/health" variant="contained">
          Ver estado de servicios
        </Button>
      </Stack>
    </MainLayout>
  );
}
