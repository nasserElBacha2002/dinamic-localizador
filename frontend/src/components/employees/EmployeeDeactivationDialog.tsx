import { Button, Group, Stack, Text } from "@mantine/core";
import {
  DataTable,
  FormErrorAlert,
  ResponsiveModal,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { terminology } from "../../domain/terminology";
import type { EmployeeDeactivationImpact } from "../../types/employee-deactivation";
import { operationStatusLabels } from "../../utils/labels";
import { operationKindLabels } from "../../utils/operation-schedule-display";
import { buildDeactivationSummaryMessage } from "./employee-deactivation-copy";

interface EmployeeDeactivationDialogProps {
  open: boolean;
  employeeName: string;
  impact: EmployeeDeactivationImpact | null;
  loading?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

type ImpactAssignment = EmployeeDeactivationImpact["affectedAssignments"][number];

const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
};

const formatSchedule = (start: string | null, end: string | null): string => {
  if (!start && !end) {
    return "—";
  }
  if (start && end) {
    return `${start} – ${end}`;
  }
  return start ?? end ?? "—";
};

export function EmployeeDeactivationDialog({
  open,
  employeeName,
  impact,
  loading = false,
  errorMessage = null,
  onConfirm,
  onCancel,
}: EmployeeDeactivationDialogProps) {
  const worker = terminology.worker.singular.toLowerCase();
  const assignments = impact?.affectedAssignments ?? [];

  const columns: DataTableColumn<ImpactAssignment>[] = [
    { key: "operationName", header: "Operación", getValue: (row) => row.operationName },
    { key: "date", header: "Fecha", getValue: (row) => formatDate(row.date) },
    {
      key: "status",
      header: "Estado",
      render: (row) => (
        <StatusBadge
          label={
            operationStatusLabels[row.status as keyof typeof operationStatusLabels] ?? row.status
          }
          tone="info"
          variant="light"
        />
      ),
    },
    {
      key: "operationType",
      header: "Tipo",
      getValue: (row) => operationKindLabels[row.operationType] ?? row.operationType,
    },
    { key: "locationName", header: "Ubicación", getValue: (row) => row.locationName },
    {
      key: "schedule",
      header: "Horario",
      getValue: (row) => formatSchedule(row.startTime, row.endTime),
    },
    { key: "workTeamName", header: "Grupo", getValue: (row) => row.workTeamName ?? "—" },
  ];

  const mobileCard: DataTableMobileCardConfig<ImpactAssignment> = {
    title: (row) => row.operationName,
    status: (row) => (
      <StatusBadge
        label={
          operationStatusLabels[row.status as keyof typeof operationStatusLabels] ?? row.status
        }
        tone="info"
        variant="light"
      />
    ),
    fields: [
      {
        key: "date",
        label: "Fecha",
        render: (row) => formatDate(row.date),
        visibility: "always",
      },
      {
        key: "locationName",
        label: "Ubicación",
        render: (row) => row.locationName,
        visibility: "always",
      },
      {
        key: "schedule",
        label: "Horario",
        render: (row) => formatSchedule(row.startTime, row.endTime),
        visibility: "always",
      },
      {
        key: "operationType",
        label: "Tipo",
        render: (row) => operationKindLabels[row.operationType] ?? row.operationType,
        visibility: "expanded",
      },
      {
        key: "workTeamName",
        label: "Grupo",
        render: (row) => row.workTeamName ?? "—",
        visibility: "expanded",
      },
    ],
  };

  return (
    <ResponsiveModal
      opened={open}
      onClose={loading ? () => undefined : onCancel}
      title="Desactivar colaborador"
      size="xl"
      bodyMode="scroll"
      withinPortal={false}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      footer={
        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Button variant="default" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button color="danger" onClick={onConfirm} loading={loading} disabled={loading}>
            Desactivar y desasignar
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm">
          <Text span fw={600}>
            {employeeName}
          </Text>{" "}
          está asignado a operaciones activas o programadas. Al continuar, será desasignado de las
          siguientes actividades y quedará inactivo.
        </Text>
        {impact ? (
          <Text size="sm" c="dimmed">
            {buildDeactivationSummaryMessage(impact)}
          </Text>
        ) : null}

        {assignments.length > 0 ? (
          <DataTable
            rows={assignments}
            columns={columns}
            getRowKey={(row) => `${row.assignmentId}-${row.workdayId ?? row.date ?? "na"}`}
            mobileView="summary"
            mobileCard={mobileCard}
            aria-label="Asignaciones afectadas por la desactivación"
            emptyTitle="Sin asignaciones afectadas"
            emptyDescription="No hay operaciones futuras para desasignar."
          />
        ) : null}

        {impact && impact.activeWorkTeamMemberships.length > 0 ? (
          <Text size="sm" c="dimmed">
            También se quitará al {worker} de{" "}
            {impact.activeWorkTeamMemberships.map((team) => team.workTeamName).join(", ")}.
          </Text>
        ) : null}

        <FormErrorAlert message={errorMessage} />
      </Stack>
    </ResponsiveModal>
  );
}
