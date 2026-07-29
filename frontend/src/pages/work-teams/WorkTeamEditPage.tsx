import { Button, Group, Stack, Text } from "@mantine/core";
import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { WorkTeamForm, type WorkTeamFormValues } from "../../components/work-teams/WorkTeamForm";
import { UnsavedChangesDialog } from "../../components/navigation/UnsavedChangesDialog";
import {
  ConfirmDialog,
  DataTable,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useUnsavedChangesController } from "../../hooks/useUnsavedChangesController";
import {
  useActivateWorkTeam,
  useDeactivateWorkTeam,
  useReplaceWorkTeamMembers,
  useUpdateWorkTeam,
  useWorkTeam,
  useWorkTeamUsage,
} from "../../hooks/useWorkTeams";
import type { WorkTeamUsageRecord } from "../../types/work-team";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityDetailPath, isEntityEditPath } from "../../utils/entity-routes";
import { hasPermission } from "../../utils/permissions";
import { operationKindLabels } from "../../utils/operation-schedule-display";
import { safeText } from "../../utils/display-safe";
import {
  executeWorkTeamSave,
  workTeamSaveErrorMessage,
} from "../../utils/work-team-save";

export function WorkTeamEditPage() {
  const { id } = useParams<{ id: string }>();
  const { goBackToList } = useListBackNavigation("/work-teams");
  const navigate = useNavigate();
  const location = useLocation();
  const onEditRoute = isEntityEditPath(location.pathname, "work-teams");
  const unsaved = useUnsavedChangesController({ active: onEditRoute });
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "employees:manage");
  const teamQuery = useWorkTeam(id);
  const updateMutation = useUpdateWorkTeam(id ?? "");
  const replaceMembersMutation = useReplaceWorkTeamMembers(id ?? "");
  const activateMutation = useActivateWorkTeam();
  const deactivateMutation = useDeactivateWorkTeam();
  const usageQuery = useWorkTeamUsage(id ?? "", { page: 1, limit: 10 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const submitInFlight = useRef(false);

  if (!id) {
    return <ErrorState message="Grupo no encontrado." />;
  }

  if (teamQuery.isLoading || permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (teamQuery.isError || !teamQuery.data) {
    return <ErrorState message={getApiErrorMessage(teamQuery.error, "Grupo no encontrado.")} />;
  }

  const team = teamQuery.data;
  const existingMembers = team.members
    .map((member) => member.employee)
    .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee));

  const initialValues: WorkTeamFormValues = {
    name: team.name,
    description: team.description ?? "",
    employeeIds: team.members.map((member) => member.employeeId),
  };

  const goToDetail = () => {
    navigate(getEntityDetailPath("work-teams", id), { state: location.state });
  };

  const handleCancel = () => {
    unsaved.requestNavigation(() => {
      if (onEditRoute) {
        goToDetail();
        return;
      }
      goBackToList();
    });
  };

  const handleSaveSuccess = () => {
    unsaved.markClean();
    if (onEditRoute) {
      goToDetail();
      return;
    }
    goBackToList();
  };

  const handleSubmit = async (values: WorkTeamFormValues) => {
    if (submitInFlight.current) {
      return;
    }
    submitInFlight.current = true;
    setErrorMessage(null);
    unsaved.setSubmitting(true);

    try {
      const result = await executeWorkTeamSave(initialValues, values, {
        updateProfile: (input) => updateMutation.mutateAsync(input),
        replaceMembers: (employeeIds) => replaceMembersMutation.mutateAsync(employeeIds),
      });

      if (result.status === "noop" || result.status === "success") {
        handleSaveSuccess();
        return;
      }

      if (result.status === "members_failed_after_profile") {
        await teamQuery.refetch();
      }

      setErrorMessage(workTeamSaveErrorMessage(result, getApiErrorMessage(result.error)));
    } finally {
      unsaved.setSubmitting(false);
      submitInFlight.current = false;
    }
  };

  const usageColumns: DataTableColumn<WorkTeamUsageRecord>[] = [
    {
      key: "serviceName",
      header: "Servicio",
      getValue: (row) => row.serviceName ?? "—",
    },
    {
      key: "operationKind",
      header: "Tipo",
      getValue: (row) =>
        operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ?? row.operationKind,
    },
    {
      key: "requestedAt",
      header: "Fecha",
      getValue: (row) => formatDateTime(row.requestedAt),
    },
    {
      key: "addedCount",
      header: "Agregados",
      getValue: (row) => String(row.addedCount),
    },
    {
      key: "skippedCount",
      header: "Omitidos",
      getValue: (row) => String(row.skippedCount),
    },
    {
      key: "operationId",
      header: "Operación",
      render: (row) => (
        <Button component={Link} to={`/operations/${row.operationId}`} variant="subtle" size="compact-sm">
          Ver operación
        </Button>
      ),
    },
  ];

  const handleDeactivate = async () => {
    await deactivateMutation.mutateAsync(id);
    setDeactivateOpen(false);
  };

  return (
    <Stack gap="md">
      <PageHeader
        title={team.name}
        description="Administrá la plantilla y consultá su historial de uso."
        action={
          canManage ? (
            <Group>
              {team.isActive ? (
                <Button variant="light" color="red" onClick={() => setDeactivateOpen(true)}>
                  Desactivar
                </Button>
              ) : (
                <Button
                  variant="light"
                  onClick={() => activateMutation.mutate(id)}
                  loading={activateMutation.isPending}
                >
                  Activar
                </Button>
              )}
            </Group>
          ) : undefined
        }
      />

      <Group>
        <StatusBadge
          label={team.isActive ? "Activo" : "Inactivo"}
          tone={team.isActive ? "success" : "neutral"}
        />
        <Text size="sm" c="dimmed">
          {team.memberCount ?? 0} integrantes · {team.activeMemberCount ?? 0} activos
        </Text>
      </Group>

      {canManage ? (
        <WorkTeamForm
          defaultValues={initialValues}
          existingMembers={existingMembers}
          submitLabel="Guardar cambios"
          loading={updateMutation.isPending || replaceMembersMutation.isPending}
          errorMessage={errorMessage}
          onDirtyChange={onEditRoute ? unsaved.setDirty : undefined}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
        />
      ) : (
        <SectionCard title="Información general">
          <DetailFieldGrid
            fields={[
              { label: "Nombre", value: team.name },
              {
                label: "Descripción",
                value: safeText(team.description),
                span: { base: 12, sm: 12, lg: 8 },
              },
              {
                label: "Integrantes",
                value: `${team.memberCount ?? 0} · ${team.activeMemberCount ?? 0} activos`,
              },
            ]}
          />
        </SectionCard>
      )}

      <SectionCard title="Historial de uso" description="Operaciones donde se utilizó este grupo.">
        <DataTable
          columns={usageColumns}
          rows={usageQuery.data?.data ?? []}
          getRowKey={(row) => row.batchId}
          loading={usageQuery.isPending}
          error={usageQuery.isError ? getApiErrorMessage(usageQuery.error) : undefined}
          emptyTitle="Sin historial de uso"
          emptyDescription="Este grupo aún no fue utilizado en asignaciones."
          mobileView="cards"
          mobileCard={{
            title: (row) => row.serviceName ?? "Operación",
            subtitle: (row) =>
              operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ??
              row.operationKind,
            fields: [
              {
                key: "requestedAt",
                label: "Fecha",
                render: (row) => formatDateTime(row.requestedAt),
                visibility: "always",
              },
              {
                key: "addedCount",
                label: "Agregados",
                render: (row) => String(row.addedCount),
                visibility: "always",
              },
              {
                key: "skippedCount",
                label: "Omitidos",
                render: (row) => String(row.skippedCount),
                visibility: "expanded",
              },
            ],
            actions: (row) => (
              <Button
                component={Link}
                to={`/operations/${row.operationId}`}
                variant="light"
                size="compact-sm"
              >
                Ver operación
              </Button>
            ),
          }}
          aria-label="Historial de uso del grupo"
        />
      </SectionCard>

      <ConfirmDialog
        open={deactivateOpen}
        title="Desactivar grupo"
        description="El grupo dejará de estar disponible para nuevas asignaciones. Las operaciones ya asignadas no se modificarán."
        confirmLabel="Desactivar"
        destructive
        loading={deactivateMutation.isPending}
        onConfirm={() => void handleDeactivate()}
        onCancel={() => setDeactivateOpen(false)}
      />
      <UnsavedChangesDialog
        open={unsaved.discardDialogOpen}
        onConfirm={unsaved.confirmDiscard}
        onCancel={unsaved.cancelDiscard}
      />
    </Stack>
  );
}
