import { Button, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { WorkTeamForm } from "../../components/work-teams/WorkTeamForm";
import {
  ConfirmDialog,
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
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
import { hasPermission } from "../../utils/permissions";
import { operationKindLabels } from "../../utils/operation-schedule-display";

export function WorkTeamEditPage() {
  const { id } = useParams<{ id: string }>();
  const { goBackToList } = useListBackNavigation("/work-teams");
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

  if (!id) {
    return <ErrorState message="Grupo no encontrado." />;
  }

  if (teamQuery.isLoading) {
    return <LoadingState />;
  }

  if (teamQuery.isError || !teamQuery.data) {
    return <ErrorState message={getApiErrorMessage(teamQuery.error, "Grupo no encontrado.")} />;
  }

  const team = teamQuery.data;
  const existingMembers = team.members
    .map((member) => member.employee)
    .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee));

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
          defaultValues={{
            name: team.name,
            description: team.description ?? "",
            employeeIds: team.members.map((member) => member.employeeId),
          }}
          existingMembers={existingMembers}
          submitLabel="Guardar cambios"
          loading={updateMutation.isPending || replaceMembersMutation.isPending}
          errorMessage={errorMessage}
          onCancel={goBackToList}
          onSubmit={async (values) => {
            setErrorMessage(null);
            try {
              if (values.name !== team.name || values.description !== (team.description ?? "")) {
                await updateMutation.mutateAsync({
                  name: values.name,
                  description: values.description || null,
                });
              }
              await replaceMembersMutation.mutateAsync(values.employeeIds);
              goBackToList();
            } catch (error) {
              setErrorMessage(getApiErrorMessage(error));
            }
          }}
        />
      ) : null}

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
    </Stack>
  );
}
