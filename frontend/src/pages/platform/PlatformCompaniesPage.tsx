import { Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { useState } from "react";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { useAuth } from "../../hooks/useAuth";
import { useCompany } from "../../hooks/useCompany";
import { useCreatePlatformCompany, usePlatformCompanies } from "../../hooks/usePlatformCompanies";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { CreatePlatformCompanyInput } from "../../types/platform-company";
import { getApiErrorMessage } from "../../utils/errors";
import { CreatePlatformCompanyDialog } from "./CreatePlatformCompanyDialog";

export function PlatformCompaniesPage() {
  const { user } = useAuth();
  const { refreshCompanies } = useCompany();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const companiesQuery = usePlatformCompanies(isPlatformAdmin);
  const createMutation = useCreatePlatformCompany();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCreate = async (input: CreatePlatformCompanyInput) => {
    setDialogError(null);
    try {
      const result = await createMutation.mutateAsync(input);
      setDialogOpen(false);
      await refreshCompanies();
      setSuccessMessage(
        result.data.message ||
          "Empresa creada. Compartí la contraseña temporal que ingresaste con el usuario owner.",
      );
    } catch (error) {
      setDialogError(getApiErrorMessage(error));
    }
  };

  if (!isPlatformAdmin) {
    return (
      <AdminLayout>
        <ErrorState message="Solo un superadministrador de plataforma puede gestionar empresas." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Empresas de plataforma"
        description="Creá empresas nuevas y asigná el usuario owner inicial."
        action={
          <Button variant="contained" onClick={() => { setDialogError(null); setDialogOpen(true); }}>
            Crear empresa
          </Button>
        }
      />

      {companiesQuery.isPending ? <LoadingState /> : null}
      {companiesQuery.isError ? <ErrorState message={getApiErrorMessage(companiesQuery.error)} /> : null}

      {companiesQuery.data && companiesQuery.data.length === 0 ? (
        <EmptyState title="No hay empresas activas" description="Creá la primera empresa de la plataforma." />
      ) : null}

      {companiesQuery.data && companiesQuery.data.length > 0 ? (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Empresas de plataforma">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Zona horaria</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {companiesQuery.data.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>{company.name}</TableCell>
                  <TableCell>{company.status}</TableCell>
                  <TableCell>{company.defaultTimezone}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      <CreatePlatformCompanyDialog
        open={dialogOpen}
        loading={createMutation.isPending}
        errorMessage={dialogError}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreate}
      />

      <FeedbackSnackbar open={Boolean(successMessage)} message={successMessage ?? ""} onClose={() => setSuccessMessage(null)} />
    </AdminLayout>
  );
}
