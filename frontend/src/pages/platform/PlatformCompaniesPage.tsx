import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import {
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
  type DataTableColumn,
} from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useCompany } from "../../hooks/useCompany";
import { useCreatePlatformCompany, usePlatformCompanies } from "../../hooks/usePlatformCompanies";
import type { CreatePlatformCompanyInput, PlatformCompany } from "../../types/platform-company";
import { getApiErrorMessage } from "../../utils/errors";
import { CreatePlatformCompanyDialog } from "./CreatePlatformCompanyDialog";

// Platform admin list: no filters, search, or pagination — URL table state not applicable.
export function PlatformCompaniesPage() {
  const { user } = useAuth();
  const { refreshCompanies } = useCompany();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const companiesQuery = usePlatformCompanies(isPlatformAdmin);
  const createMutation = useCreatePlatformCompany();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const handleCreate = async (input: CreatePlatformCompanyInput) => {
    setDialogError(null);
    try {
      const result = await createMutation.mutateAsync(input);
      setDialogOpen(false);
      await refreshCompanies();
      notifications.show({
        color: "green",
        message:
          result.data.message ||
          "Empresa creada. Compartí la contraseña temporal que ingresaste con el usuario owner.",
      });
    } catch (error) {
      setDialogError(getApiErrorMessage(error));
    }
  };

  const columns = useMemo<DataTableColumn<PlatformCompany>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      { key: "status", header: "Estado", getValue: (row) => row.status },
      { key: "defaultTimezone", header: "Zona horaria", getValue: (row) => row.defaultTimezone },
    ],
    [],
  );

  if (!isPlatformAdmin) {
    return (
      <ErrorState message="Solo un superadministrador de plataforma puede gestionar empresas." />
    );
  }

  return (
    <>
      <PageHeader
        title="Empresas de plataforma"
        description="Creá empresas nuevas y asigná el usuario owner inicial."
        action={
          <Button
            onClick={() => {
              setDialogError(null);
              setDialogOpen(true);
            }}
          >
            Crear empresa
          </Button>
        }
      />

      {companiesQuery.isPending ? <LoadingState /> : null}

      {!companiesQuery.isPending ? (
        <DataTable
          rows={companiesQuery.data ?? []}
          columns={columns}
          getRowKey={(row) => row.id}
          error={companiesQuery.isError ? getApiErrorMessage(companiesQuery.error) : undefined}
          emptyTitle="No hay empresas activas"
          emptyDescription="Creá la primera empresa de la plataforma."
          aria-label="Empresas de plataforma"
        />
      ) : null}

      <CreatePlatformCompanyDialog
        open={dialogOpen}
        loading={createMutation.isPending}
        errorMessage={dialogError}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreate}
      />

    </>
  );
}
