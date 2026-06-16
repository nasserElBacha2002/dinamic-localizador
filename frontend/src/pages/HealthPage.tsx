import { Alert, Grid, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import { StatusCard } from "../components/StatusCard";
import { useApiHealth, useDatabaseHealth } from "../hooks/useHealth";
import { MainLayout } from "../layouts/MainLayout";

export function HealthPage() {
  const apiHealth = useApiHealth();
  const databaseHealth = useDatabaseHealth();

  const lastCheck = useMemo(() => new Date().toLocaleString("es-AR"), [apiHealth.dataUpdatedAt]);

  return (
    <MainLayout>
      <Stack spacing={3}>
        <Typography variant="h4">Estado de servicios</Typography>
        <Typography color="text.secondary">Ultima consulta: {lastCheck}</Typography>

        {(apiHealth.error || databaseHealth.error) && (
          <Alert severity="error">
            {apiHealth.error?.message ?? databaseHealth.error?.message ?? "Error al consultar estado"}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <StatusCard
              title="Backend"
              status={apiHealth.isLoading ? "loading" : apiHealth.data?.status === "ok" ? "ok" : "error"}
              details={
                apiHealth.data
                  ? `Servicio: ${apiHealth.data.service} | Timestamp: ${apiHealth.data.timestamp}`
                  : "Sin datos"
              }
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <StatusCard
              title="Base de datos"
              status={
                databaseHealth.isLoading
                  ? "loading"
                  : databaseHealth.data?.database === "connected"
                    ? "ok"
                    : "error"
              }
              details={databaseHealth.data?.message ?? `Estado: ${databaseHealth.data?.database ?? "sin datos"}`}
            />
          </Grid>
        </Grid>
      </Stack>
    </MainLayout>
  );
}
