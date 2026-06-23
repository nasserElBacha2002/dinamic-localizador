import { Button, Card, CardActions, CardContent, Grid, Stack, Typography } from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { StatusCard } from "../components/StatusCard";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { PageHeader } from "../components/common/PageHeader";
import { getEmployees } from "../api/employees.api";
import { getInventories } from "../api/inventories.api";
import { useApiHealth, useDatabaseHealth } from "../hooks/useHealth";
import { AdminLayout } from "../layouts/AdminLayout";
import type { InventoryWithStore } from "../types/inventory";
import { formatDateTime } from "../utils/dates";
import { useQuery } from "@tanstack/react-query";

const quickLinks = [
  { title: "Empleados", description: "Gestionar personal", to: "/employees" },
  { title: "Tiendas", description: "Configurar puntos de inventario", to: "/stores" },
  { title: "Inventarios", description: "Planificar jornadas", to: "/inventories" },
  { title: "Asistencias", description: "Revisar registros", to: "/attendance" },
];

export function HomePage() {
  const apiHealth = useApiHealth();
  const databaseHealth = useDatabaseHealth();

  const activeEmployeesQuery = useQuery({
    queryKey: ["employees", { active: true, page: 1, limit: 1 }],
    queryFn: () => getEmployees({ active: true, page: 1, limit: 1 }),
    enabled: databaseHealth.data?.database === "connected",
  });

  const upcomingInventoriesQuery = useQuery({
    queryKey: ["inventories", { status: "SCHEDULED", page: 1, limit: 5 }],
    queryFn: () => getInventories({ status: "SCHEDULED", page: 1, limit: 5 }),
    enabled: databaseHealth.data?.database === "connected",
  });

  return (
    <AdminLayout>
      <PageHeader
        title="Dinamic Attendance"
        description="Panel administrativo para planificar inventarios, asignar empleados y revisar asistencias."
      />

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <StatusCard
            title="Backend"
            status={apiHealth.isLoading ? "loading" : apiHealth.isError ? "error" : "ok"}
            details={
              apiHealth.data
                ? `Servicio ${apiHealth.data.service} operativo`
                : apiHealth.isError
                  ? "No se pudo contactar al backend"
                  : "Verificando..."
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
            details={
              databaseHealth.data?.database === "connected"
                ? "Conexión establecida"
                : databaseHealth.data?.message ?? "Verificando conexión..."
            }
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <StatusCard
            title="Empleados activos"
            status={activeEmployeesQuery.isLoading ? "loading" : activeEmployeesQuery.isError ? "error" : "ok"}
            details={
              activeEmployeesQuery.data
                ? `${activeEmployeesQuery.data.meta.total} empleados activos`
                : "No disponible"
            }
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <StatusCard
            title="Próximos inventarios"
            status={
              upcomingInventoriesQuery.isLoading
                ? "loading"
                : upcomingInventoriesQuery.isError
                  ? "error"
                  : "ok"
            }
            details={
              upcomingInventoriesQuery.data
                ? `${upcomingInventoriesQuery.data.meta.total} inventarios programados`
                : "No disponible"
            }
          />
        </Grid>
      </Grid>

      <Typography variant="h5" gutterBottom>
        Accesos rápidos
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {quickLinks.map((link) => (
          <Grid key={link.to} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h6">{link.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {link.description}
                </Typography>
              </CardContent>
              <CardActions>
                <Button component={RouterLink} to={link.to} size="small">
                  Ir
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h5" gutterBottom>
        Próximos inventarios
      </Typography>
      {upcomingInventoriesQuery.isLoading ? <LoadingState /> : null}
      {upcomingInventoriesQuery.isError ? (
        <ErrorState message="No se pudieron cargar los inventarios programados." />
      ) : null}
      {upcomingInventoriesQuery.data?.data.length === 0 ? (
        <Typography color="text.secondary">No hay inventarios programados.</Typography>
      ) : null}
      {upcomingInventoriesQuery.data && upcomingInventoriesQuery.data.data.length > 0 ? (
        <Stack spacing={1}>
          {upcomingInventoriesQuery.data.data.map((inventory) => (
            <UpcomingInventoryCard key={inventory.id} inventory={inventory} />
          ))}
        </Stack>
      ) : null}
    </AdminLayout>
  );
}

function UpcomingInventoryCard({ inventory }: { inventory: InventoryWithStore }) {
  const navigate = useNavigate();

  return (
    <Card
      variant="outlined"
      role="link"
      tabIndex={0}
      aria-label={`Ver inventario de ${inventory.store.name}`}
      onClick={() => navigate(`/inventories/${inventory.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(`/inventories/${inventory.id}`);
        }
      }}
      sx={{
        cursor: "pointer",
        transition: (theme) => theme.transitions.create("background-color"),
        "&:hover": {
          backgroundColor: "action.hover",
        },
      }}
    >
      <CardContent>
        <BoxInfo
          title={inventory.store.name}
          subtitle={`${inventory.store.address ?? "—"} · ${formatDateTime(inventory.scheduledStart)}`}
        />
      </CardContent>
    </Card>
  );
}

function BoxInfo({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <Typography fontWeight={600}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
    </div>
  );
}
