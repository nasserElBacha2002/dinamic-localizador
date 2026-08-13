import { Button, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { EntityLink } from "../../components/entity-link";
import {
  ActionMenu,
  ConfirmDialog,
  DataTable,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type ActionMenuItem,
  type DataTableColumn,
} from "../../design-system";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import {
  useActivateWorkTeam,
  useDeactivateWorkTeam,
  useWorkTeam,
  useWorkTeamUsage,
} from "../../hooks/useWorkTeams";
import type { WorkTeamUsageRecord } from "../../types/work-team";
import { formatDateTime } from "../../utils/dates";
import { safeText } from "../../utils/display-safe";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityEditPath } from "../../utils/entity-routes";
import { operationKindLabels } from "../../utils/operation-schedule-display";
import { hasPermission } from "../../utils/permissions";

export function WorkTeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goBackToList } = useListBackNavigation("/work-teams");
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "employees:manage");
  const teamQuery = useWorkTeam(id);
  const activateMutation = useActivateWorkTeam();
  const deactivateMutation = useDeactivateWorkTeam();
  const usageQuery = useWorkTeamUsage(id ?? "", { page: 1, limit: 10 });
  const [deactivateOpen, setDeactivateOpen] = useState(false);

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
  const members = team.members
    .map((member) => member.employee)
    .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee));

  const usageColumns: DataTableColumn<WorkTeamUsageRecord>[] = [
    {
      key: "serviceName",
      header: "Servicio",
      render: (row) => (
        <EntityLink
          entityType="service"
          entityId={row.serviceId}
          label={row.serviceName ?? "—"}
        />
      ),
    },
    {
      key: "operation",
      header: "Operación",
      render: (row) => (
        <EntityLink
          entityType="operation"
          entityId={row.operationId}
          label={row.operationName ?? formatDateTime(row.requestedAt)}
        />
      ),
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
  ];

  const handleDeactivate = async () => {
    await deactivateMutation.mutateAsync(id);
    setDeactivateOpen(false);
  };

  return (
    <Stack gap="md">
      <PageHeader
        title={team.name}
        description="Consulta de plantilla de colaboradores e historial de uso."
        action={
          <ActionMenu
            primary={
              canManage ? (
                <Button
                  onClick={() => navigate(getEntityEditPath("work-teams", team.id))}
                >
                  Editar
                </Button>
              ) : (
                <Button variant="default" onClick={goBackToList}>
                  Volver al listado
                </Button>
              )
            }
            items={
              [
                ...(canManage
                  ? [
                      team.isActive
                        ? {
                            key: "deactivate",
                            label: "Desactivar",
                            destructive: true,
                            onClick: () => setDeactivateOpen(true),
                          }
                        : {
                            key: "activate",
                            label: "Activar",
                            loading: activateMutation.isPending,
                            disabled: activateMutation.isPending,
                            onClick: () => activateMutation.mutate(id),
                          },
                      {
                        key: "back",
                        label: "Volver al listado",
                        onClick: goBackToList,
                      },
                    ]
                  : []),
              ] as ActionMenuItem[]
            }
            menuLabel="Más acciones del grupo"
          />
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
              label: "Estado",
              value: team.isActive ? "Activo" : "Inactivo",
            },
            {
              label: "Integrantes",
              value: `${team.memberCount ?? 0}`,
            },
            {
              label: "Integrantes activos",
              value: `${team.activeMemberCount ?? 0}`,
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Integrantes" description="Listado de consulta. La administración se realiza desde Editar.">
        {members.length === 0 ? (
          <Text size="sm" c="dimmed">
            Este grupo no tiene integrantes.
          </Text>
        ) : (
          <Stack gap="xs" role="list" aria-label="Integrantes del grupo">
            {members.map((employee) => (
              <Group key={employee.id} justify="space-between" role="listitem">
                <div>
                  <Text size="sm" fw={500}>
                    <EntityLink
                      entityType="employee"
                      entityId={employee.id}
                      label={employee.name}
                    />
                  </Text>
                  <Text size="xs" c="dimmed">
                    {employee.phoneNumber}
                  </Text>
                </div>
                <StatusBadge
                  label={employee.active ? "Activo" : "Inactivo"}
                  tone={employee.active ? "success" : "neutral"}
                />
              </Group>
            ))}
          </Stack>
        )}
      </SectionCard>

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
            title: (row) => (
              <EntityLink
                entityType="service"
                entityId={row.serviceId}
                label={row.serviceName ?? "—"}
              />
            ),
            subtitle: (row) =>
              operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ??
              row.operationKind,
            fields: [
              {
                key: "operation",
                label: "Operación",
                render: (row) => (
                  <EntityLink
                    entityType="operation"
                    entityId={row.operationId}
                    label={row.operationName ?? formatDateTime(row.requestedAt)}
                  />
                ),
                visibility: "always",
              },
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
