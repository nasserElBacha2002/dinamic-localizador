import { Alert, Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useMemo, useState } from "react";
import {
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useCompany } from "../../hooks/useCompany";
import {
  useCreatePlatformCompany,
  useDeactivatePlatformCompany,
  usePlatformCompanies,
  useReactivatePlatformCompany,
} from "../../hooks/usePlatformCompanies";
import type { CreatePlatformCompanyInput, PlatformCompany } from "../../types/platform-company";
import { getApiErrorMessage } from "../../utils/errors";
import { CreatePlatformCompanyDialog } from "./CreatePlatformCompanyDialog";
import { DeactivatePlatformCompanyDialog } from "./DeactivatePlatformCompanyDialog";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "success",
  PENDING_DELETION: "warning",
  DELETION_FAILED: "danger",
  DELETING: "danger",
  INACTIVE: "neutral",
  SUSPENDED: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activa",
  INACTIVE: "Inactiva",
  SUSPENDED: "Suspendida",
  PENDING_DELETION: "Pendiente de eliminación",
  DELETING: "Eliminando",
  DELETION_FAILED: "Fallo de eliminación",
  DELETED: "Eliminada",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function daysRemaining(scheduledDeletionAt: string | null | undefined): string {
  if (!scheduledDeletionAt) return "—";
  const scheduled = new Date(scheduledDeletionAt).getTime();
  if (Number.isNaN(scheduled)) return "—";
  const days = Math.max(0, Math.ceil((scheduled - Date.now()) / (24 * 60 * 60 * 1000)));
  return `${days} día${days === 1 ? "" : "s"}`;
}

const DEFAULT_GRACE_DAYS = 30;

export function PlatformCompaniesPage() {
  const { user } = useAuth();
  const { refreshCompanies } = useCompany();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const companiesQuery = usePlatformCompanies(isPlatformAdmin);
  const createMutation = useCreatePlatformCompany();
  const deactivateMutation = useDeactivatePlatformCompany();
  const reactivateMutation = useReactivatePlatformCompany();

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<PlatformCompany | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async (input: CreatePlatformCompanyInput) => {
    setCreateError(null);
    try {
      const result = await createMutation.mutateAsync(input);
      setCreateOpen(false);
      await refreshCompanies();
      notifications.show({
        color: "green",
        message:
          result.data.message ||
          "Empresa creada. Se envió una invitación al dueño por correo.",
      });
    } catch (error) {
      setCreateError(getApiErrorMessage(error));
    }
  };

  const handleDeactivate = async (reason: string) => {
    if (!deactivateTarget) return;
    setDeactivateError(null);
    try {
      const result = await deactivateMutation.mutateAsync({
        companyId: deactivateTarget.id,
        reason,
      });
      setDeactivateTarget(null);
      await refreshCompanies();
      notifications.show({
        color: "yellow",
        message: `Empresa desactivada. Eliminación programada: ${formatDate(result.scheduledDeletionAt)}.`,
      });
    } catch (error) {
      setDeactivateError(getApiErrorMessage(error));
    }
  };

  const handleReactivate = useCallback(
    async (company: PlatformCompany) => {
      setActionError(null);
      try {
        await reactivateMutation.mutateAsync(company.id);
        await refreshCompanies();
        notifications.show({
          color: "green",
          message: "Empresa reactivada. La eliminación programada fue cancelada.",
        });
      } catch (error) {
        setActionError(getApiErrorMessage(error));
      }
    },
    [reactivateMutation, refreshCompanies],
  );

  const columns = useMemo<DataTableColumn<PlatformCompany>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      {
        key: "owner",
        header: "Dueño",
        render: (row) => {
          if (!row.ownerEmail) {
            return <span>—</span>;
          }
          const label = row.ownerName
            ? `${row.ownerName} (${row.ownerEmail})`
            : row.ownerEmail;
          if (row.ownerStatus === "INVITED") {
            return (
              <span>
                {label}{" "}
                <StatusBadge label="Invitación pendiente" tone="warning" />
              </span>
            );
          }
          return <span>{label}</span>;
        },
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={STATUS_LABEL[row.status] ?? row.status}
            tone={STATUS_TONE[row.status] ?? "neutral"}
          />
        ),
      },
      {
        key: "deactivatedAt",
        header: "Desactivada",
        getValue: (row) => formatDate(row.deactivatedAt),
      },
      {
        key: "scheduledDeletionAt",
        header: "Eliminación prevista",
        getValue: (row) => formatDate(row.scheduledDeletionAt),
      },
      {
        key: "daysRemaining",
        header: "Días restantes",
        getValue: (row) =>
          row.status === "PENDING_DELETION" || row.status === "DELETION_FAILED"
            ? daysRemaining(row.scheduledDeletionAt)
            : "—",
      },
      {
        key: "reason",
        header: "Motivo",
        getValue: (row) => row.deactivationReason?.trim() || "—",
      },
      {
        key: "actions",
        header: "Acciones",
        render: (row) => {
          const canDeactivate =
            row.status === "ACTIVE" ||
            row.status === "INACTIVE" ||
            row.status === "SUSPENDED";
          const canReactivate =
            row.status === "PENDING_DELETION" || row.status === "DELETION_FAILED";
          return (
            <Group gap="xs" wrap="wrap">
              {canDeactivate ? (
                <Button
                  size="xs"
                  variant="light"
                  color="danger"
                  onClick={() => {
                    setDeactivateError(null);
                    setDeactivateTarget(row);
                  }}
                >
                  Desactivar
                </Button>
              ) : null}
              {canReactivate ? (
                <Button
                  size="xs"
                  variant="light"
                  color="brand"
                  loading={reactivateMutation.isPending}
                  onClick={() => void handleReactivate(row)}
                >
                  Reactivar
                </Button>
              ) : null}
              {row.status === "DELETING" ? (
                <StatusBadge label="Eliminación en curso" tone="danger" />
              ) : null}
              {row.status === "DELETION_FAILED" && row.deletionLastError ? (
                <Text size="xs" c="red" maw={220}>
                  {row.deletionLastError}
                </Text>
              ) : null}
            </Group>
          );
        },
      },
      { key: "defaultTimezone", header: "Zona horaria", getValue: (row) => row.defaultTimezone },
    ],
    [handleReactivate, reactivateMutation.isPending],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<PlatformCompany>>(
    () => ({
      title: (row) => row.name,
      status: (row) => (
        <StatusBadge
          label={STATUS_LABEL[row.status] ?? row.status}
          tone={STATUS_TONE[row.status] ?? "neutral"}
        />
      ),
      fields: [
        {
          key: "owner",
          label: "Dueño",
          getValue: (row) => {
            if (!row.ownerEmail) {
              return "—";
            }
            const label = row.ownerName
              ? `${row.ownerName} (${row.ownerEmail})`
              : row.ownerEmail;
            return row.ownerStatus === "INVITED" ? `${label} · invitación pendiente` : label;
          },
          visibility: "always",
        },
        {
          key: "scheduledDeletionAt",
          label: "Eliminación prevista",
          getValue: (row) => formatDate(row.scheduledDeletionAt),
          visibility: "always",
        },
        {
          key: "defaultTimezone",
          label: "Zona horaria",
          getValue: (row) => row.defaultTimezone,
          visibility: "always",
        },
      ],
    }),
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
        description="Creá empresas, desactiválas con período de gracia y reactiválas antes de la eliminación."
        action={
          <Button
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            Crear empresa
          </Button>
        }
      />

      {actionError ? (
        <Alert color="red" mb="md" onClose={() => setActionError(null)} withCloseButton>
          {actionError}
        </Alert>
      ) : null}

      {companiesQuery.isPending ? <LoadingState /> : null}

      {!companiesQuery.isPending ? (
        <DataTable
          rows={companiesQuery.data ?? []}
          columns={columns}
          getRowKey={(row) => row.id}
          error={companiesQuery.isError ? getApiErrorMessage(companiesQuery.error) : undefined}
          emptyTitle="No hay empresas"
          emptyDescription="Creá la primera empresa de la plataforma."
          aria-label="Empresas de plataforma"
          mobileView="cards"
          mobileCard={mobileCard}
        />
      ) : null}

      <CreatePlatformCompanyDialog
        open={createOpen}
        loading={createMutation.isPending}
        errorMessage={createError}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <DeactivatePlatformCompanyDialog
        key={deactivateTarget?.id ?? "deactivate-company"}
        open={Boolean(deactivateTarget)}
        company={deactivateTarget}
        gracePeriodDays={DEFAULT_GRACE_DAYS}
        loading={deactivateMutation.isPending}
        errorMessage={deactivateError}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
      />
    </>
  );
}
